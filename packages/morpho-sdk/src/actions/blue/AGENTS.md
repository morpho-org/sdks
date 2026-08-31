# `actions/blue/`

Blue (Morpho Blue) transaction builders. Inherits all rules from [`actions/AGENTS.md`](../AGENTS.md) and [`packages/morpho-sdk/AGENTS.md`](../../../AGENTS.md).

Per-function call signatures (argument order, the `morphoBorrow` tuple shape, the receiver vs initiator distinction) live as JSDoc on each action — that's the canonical source. This file documents only the routing, the bundle ordering, and the pre-conditions the entity layer enforces.

## Routing

| Function | Route |
| --- | --- |
| `blueSupply` (assets) | direct `BlueBundlesV1.blueBundlesV1Supply` call |
| `blueSupplyCollateral` | bundler3 via GeneralAdapter1 |
| `blueBorrow` | bundler3 via `morphoBorrow` |
| `blueSupplyCollateralBorrow` | bundler3 via GeneralAdapter1 (atomic) |
| `blueRepay` (assets or shares) | bundler3 via GeneralAdapter1 |
| `blueRepayWithdrawCollateral` | bundler3 — repay first, then withdraw collateral |
| `blueWithdraw` (assets or shares) | direct `BlueBundlesV1.blueBundlesV1Withdraw` call |
| `blueWithdrawCollateral` | direct Morpho call |

ERC-20 approval spender is **GeneralAdapter1** for any bundler3 path and **BlueBundlesV1** for the direct `supply` path — never the Morpho contract.

## Bundle composition

| Path | Bundle |
| --- | --- |
| `supply` (ERC-20) | single `blueBundlesV1Supply` call carrying an inline `{kind, data}` permit (`0` none / `1` ERC-2612 / `2` Permit2 SignatureTransfer) |
| `supply` (native) | single payable `blueBundlesV1Supply` call funded by `tx.value` (empty permit) |
| `supplyCollateral` (ERC-20) | `erc20TransferFrom → morphoSupplyCollateral` |
| `supplyCollateral` (native) | `nativeTransfer → wrapNative → [erc20TransferFrom?] → morphoSupplyCollateral` |
| `borrow` | `morphoBorrow` |
| `borrow` (with reallocations) | `[V2 penalty transfer?] → [allocator reallocation × N] → morphoBorrow` |
| `supplyCollateralBorrow` | `[nativeWrap?] → [erc20Transfer?] → morphoSupplyCollateral → morphoBorrow` |
| `supplyCollateralBorrow` (with reallocations) | `[nativeWrap?] → [collateral transfer?] → morphoSupplyCollateral → [V2 penalty transfer?] → [allocator reallocation × N] → morphoBorrow` |
| `repay` (ERC-20) | `[erc20TransferFrom \| permit/permit2] → morphoRepay → [erc20Transfer skim (shares mode)]` |
| `repay` (native) | `nativeTransfer → wrapNative → [erc20TransferFrom?] → morphoRepay → [skim (shares mode)]` |
| `repayWithdrawCollateral` (ERC-20) | `[erc20TransferFrom \| permit/permit2] → morphoRepay → [skim (shares mode)] → morphoWithdrawCollateral` |
| `repayWithdrawCollateral` (native) | `nativeTransfer → wrapNative → [erc20TransferFrom?] → morphoRepay → [skim (shares mode)] → morphoWithdrawCollateral` |
| `withdraw` | single `blueBundlesV1Withdraw` call |
| `withdraw` (with reallocations) | single `blueBundlesV1Withdraw` call carrying the reallocations array; penalties are netted from the withdrawn proceeds, not funded by a separate transfer |

The `borrow` / `supplyCollateralBorrow` allocator inputs above contain only BluePublicAllocator V2
`reallocate`/`allocateFromIdle` calls. For non-zero penalties, the builder
adds one aggregate loan-token funding action into Bundler3: `erc20TransferFrom` from the initiator by
default, or `erc20Transfer` from GeneralAdapter1 when `supplyCollateralBorrow` uses the same token for
collateral and loan funding. Each allocator action expands to the nonpayable allocator call; when its
penalty is non-zero, a zero reset and exact token approval precede it.
`BundlerAction.encodeBundle` derives `tx.value` only from native wrapping
calls. PublicAllocator V1 planners and encoders remain available for explicit low-level composition.
The direct `blueBundlesV1Withdraw` route is different: it takes the same `VaultV2BlueReallocation`
inputs but carries them inside its own calldata and lets the contract net each penalty from the
withdrawn assets, so no Bundler3 penalty-funding action is emitted.

## Mode and ordering rules

- `repay` accepts exactly one mode: assets (partial repay) or shares (full repay, with `maxSharePrice`). Amounts are pre-resolved by the entity and passed flat (`{ amount?, shares?, nativeAmount?, transferAmount }`); the action does no arithmetic. Both modes optionally wrap native ETH (loan token must be wNative): assets mode is additive like `supply` (`transferAmount = amount + nativeAmount` is repaid, ERC-20 pulled = `amount`), shares mode repays exact shares and pulls `transferAmount` ERC-20 (the entity already carved native out via `toBorrowAssets(shares) − nativeAmount`). `repayWithdrawCollateral` mirrors this repay leg, then withdraws.
- `withdraw` accepts exactly one mode: assets (exact asset amount) or shares (full close, immune to interest accrual). `blueBundlesV1Withdraw` sends proceeds to the transaction sender (there is no `receiver` field); reallocation penalties and any referral fee reduce them. This direct route has no Bundler3 share-price bound.
- `repayWithdrawCollateral` repays first, then withdraws — never the other order.
- `supply` has no Bundler3 share-price bound on the direct BlueBundlesV1 route: `assets` is the gross funded amount and the referral fee is deducted before supplying.
- `borrow` and `supplyCollateralBorrow` use `minSharePrice` (`WAD − slippage`, computed from market state + slippage tolerance).

## Required pre-conditions

Enforced by the entity layer's `getRequirements`; see [`entities/blue/AGENTS.md`](../../entities/blue/AGENTS.md):

- `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, and `refinance` require GeneralAdapter1 to be authorized on Morpho (`setAuthorization`); `withdraw` requires **BlueBundlesV1** to be authorized instead. When an `authorizationSignature` is passed, the bundler3 builders prepend a `setAuthorizationWithSig` call to the bundle, while `blueBundlesV1Withdraw` embeds the signed-authorization struct directly in its calldata — either way removing the standalone `setAuthorization` transaction.
- Native wrapping requires the collateral token (collateral-supply paths) or the loan token (`supply`, `repay`, `repayWithdrawCollateral`) to be the configured wNative for the chain.

Reallocation rules: see [`actions/AGENTS.md`](../AGENTS.md#shared-liquidity--reallocations-canonical-statement) for the canonical contract.
