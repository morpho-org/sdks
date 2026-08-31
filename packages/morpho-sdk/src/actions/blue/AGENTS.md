# `actions/blue/`

Blue (Morpho Blue) transaction builders. Inherits all rules from [`actions/AGENTS.md`](../AGENTS.md) and [`packages/morpho-sdk/AGENTS.md`](../../../AGENTS.md).

Per-function call signatures (argument order, the `morphoBorrow` tuple shape, the receiver vs initiator distinction) live as JSDoc on each action — that's the canonical source. This file documents only the routing, the bundle ordering, and the pre-conditions the entity layer enforces.

## Routing

| Function | Route |
| --- | --- |
| `blueSupply` (assets) | bundler3 via `morphoSupply` |
| `blueSupplyCollateral` | bundler3 via GeneralAdapter1 |
| `blueBorrow` | bundler3 via `morphoBorrow` |
| `blueSupplyCollateralBorrow` | bundler3 via GeneralAdapter1 (atomic) |
| `blueRepay` (assets or shares) | bundler3 via GeneralAdapter1 |
| `blueRepayWithdrawCollateral` | bundler3 — repay first, then withdraw collateral |
| `blueWithdraw` (assets or shares) | bundler3 via `morphoWithdraw` |
| `blueWithdrawCollateral` | direct Morpho call |

ERC-20 approval spender is **GeneralAdapter1** for any bundled path — never the Morpho contract.

## Bundle composition

| Path | Bundle |
| --- | --- |
| `supply` (ERC-20) | `[erc20TransferFrom \| permit/permit2] → morphoSupply` |
| `supply` (native) | `nativeTransfer → wrapNative → [erc20TransferFrom?] → morphoSupply` |
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
| `withdraw` | `morphoWithdraw` |
| `withdraw` (with reallocations) | `[V2 penalty transfer?] → [allocator reallocation × N] → morphoWithdraw` |

An allocator reallocation plan contains only PublicAllocator V1 `reallocateTo` calls or only
BluePublicAllocator `reallocate`/`allocateFromIdle` calls. Separate builders encode each version;
mixing versions throws `MixedReallocationVersionsError`. For non-zero V2 penalties, the V2 builder
adds one aggregate loan-token funding action into Bundler3: `erc20TransferFrom` from the initiator by
default, or `erc20Transfer` from GeneralAdapter1 when `supplyCollateralBorrow` uses the same token for
collateral and loan funding. Each allocator action expands to the nonpayable allocator call; when its
penalty is non-zero, a zero reset and exact token approval precede it.
`BundlerAction.encodeBundle` derives `tx.value` only from native wrapping
calls and PublicAllocator V1 native fees.

## Mode and ordering rules

- `repay` accepts exactly one mode: assets (partial repay) or shares (full repay, with `maxSharePrice`). Amounts are pre-resolved by the entity and passed flat (`{ amount?, shares?, nativeAmount?, transferAmount }`); the action does no arithmetic. Both modes optionally wrap native ETH (loan token must be wNative): assets mode is additive like `supply` (`transferAmount = amount + nativeAmount` is repaid, ERC-20 pulled = `amount`), shares mode repays exact shares and pulls `transferAmount` ERC-20 (the entity already carved native out via `toBorrowAssets(shares) − nativeAmount`). `repayWithdrawCollateral` mirrors this repay leg, then withdraws.
- `withdraw` accepts exactly one mode: assets (exact asset amount) or shares (full close, immune to interest accrual). No transfer/skim needed — `morphoWithdraw` sends to `receiver` directly.
- `repayWithdrawCollateral` repays first, then withdraws — never the other order.
- `supply` uses `maxSharePrice` (anti-inflation upper bound, `WAD + slippage`).
- `borrow`, `supplyCollateralBorrow`, and `withdraw` use `minSharePrice` (`WAD − slippage`, computed from market state + slippage tolerance).

## Required pre-conditions

Enforced by the entity layer's `getRequirements`; see [`entities/blue/AGENTS.md`](../../entities/blue/AGENTS.md):

- `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, `withdraw`, and `refinance` require GeneralAdapter1 to be authorized on Morpho (`setAuthorization`). When an `authorizationSignature` is passed, these builders prepend a `setAuthorizationWithSig` call to the bundle instead of relying on a separate `setAuthorization` transaction.
- Native wrapping requires the collateral token (collateral-supply paths) or the loan token (`supply`, `repay`, `repayWithdrawCollateral`) to be the configured wNative for the chain.

Reallocation rules: see [`actions/AGENTS.md`](../AGENTS.md#shared-liquidity--reallocations-canonical-statement) for the canonical contract.
