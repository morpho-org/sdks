# `actions/blue/`

Blue (Morpho Blue) transaction builders. Inherits all rules from [`actions/AGENTS.md`](../AGENTS.md) and [`packages/morpho-sdk/AGENTS.md`](../../../AGENTS.md).

Per-function call signatures (argument order, the BlueBundlesV1 combined-call arguments, native-funding rules) live as JSDoc on each action — that's the canonical source. This file documents only the routing, the bundle ordering, and the pre-conditions the entity layer enforces.

## Routing

| Function | Route |
| --- | --- |
| `blueSupply` (assets) | direct `BlueBundlesV1.blueBundlesV1Supply` call |
| `blueSupplyCollateral` | direct `BlueBundlesV1.blueBundlesV1SupplyCollateralAndBorrow` call (zero borrow leg) |
| `blueBorrow` | direct `BlueBundlesV1.blueBundlesV1SupplyCollateralAndBorrow` call (zero collateral leg) |
| `blueSupplyCollateralBorrow` | direct `BlueBundlesV1.blueBundlesV1SupplyCollateralAndBorrow` call (atomic) |
| `blueRepay` (assets or shares) | direct `BlueBundlesV1.blueBundlesV1RepayAndWithdrawCollateral` call (zero withdraw leg) |
| `blueRepayWithdrawCollateral` | direct `BlueBundlesV1.blueBundlesV1RepayAndWithdrawCollateral` call — repay first, then withdraw collateral |
| `blueWithdraw` (assets or shares) | direct `BlueBundlesV1.blueBundlesV1Withdraw` call |
| `blueWithdrawCollateral` | direct `BlueBundlesV1.blueBundlesV1RepayAndWithdrawCollateral` call (zero repay leg) |

ERC-20 approval spender is **BlueBundlesV1** for every Blue path — the collateral token for the supply/borrow entrypoint, the loan token for the repay/withdraw entrypoint — never GeneralAdapter1 or the Morpho contract.

## Bundle composition

| Path | Bundle |
| --- | --- |
| `supply` (ERC-20) | single `blueBundlesV1Supply` call carrying an inline `{kind, data}` permit (`0` none / `1` ERC-2612 / `2` Permit2 SignatureTransfer) |
| `supply` (native) | single payable `blueBundlesV1Supply` call funded by `tx.value` (empty permit) |
| `supplyCollateral` | single `blueBundlesV1SupplyCollateralAndBorrow` call (zero borrow leg) carrying the collateral `{kind, data}` permit; native funds `tx.value` |
| `borrow` | single `blueBundlesV1SupplyCollateralAndBorrow` call (zero collateral leg) carrying the signed authorization and any reallocations |
| `supplyCollateralBorrow` | single `blueBundlesV1SupplyCollateralAndBorrow` call carrying the collateral permit, signed authorization, and any reallocations; native funds `tx.value` |
| `repay` | single `blueBundlesV1RepayAndWithdrawCollateral` call (zero withdraw leg) carrying the loan-token `{kind, data}` permit; native funds `tx.value` |
| `repayWithdrawCollateral` | single `blueBundlesV1RepayAndWithdrawCollateral` call carrying the loan-token permit and signed authorization; native funds `tx.value` |
| `withdrawCollateral` | single `blueBundlesV1RepayAndWithdrawCollateral` call (zero repay leg) carrying the signed authorization |
| `withdraw` | single `blueBundlesV1Withdraw` call |
| `withdraw` (with reallocations) | single `blueBundlesV1Withdraw` call carrying the reallocations array; penalties are netted from the withdrawn proceeds, not funded by a separate transfer |

The `borrow` / `supplyCollateralBorrow` reallocation inputs above contain only BluePublicAllocator V2
`reallocate`/`allocateFromIdle` calls, carried inside the `blueBundlesV1SupplyCollateralAndBorrow`
calldata exactly like the direct `blueBundlesV1Withdraw` route. The contract nets each
`ceil(assets × penalty / WAD)` penalty from the borrow proceeds, so no separate Bundler3
penalty-funding action is emitted; the builder rejects an aggregate penalty that exceeds
`borrowAssets`. Native funding is attached to the single payable call as `tx.value`.
PublicAllocator V1 planners and encoders remain available for explicit low-level Bundler3 composition,
but those Vault V1 surfaces are deprecated and will be removed in the next major.

## Mode and ordering rules

- `repay` accepts exactly one mode: assets (`repayAssets`) or shares (`repayShares`), mutually exclusive, with `repayShares = maxUint256` requesting a saturated full repay. The entity pre-resolves the flat action inputs (`{ repayAssets, repayShares, maxRepayAssets, collateralAssets, maxLtv }`) — deriving the `maxRepayAssets` funding cap as the expected repay assets plus the referral fee — and the action does no arithmetic. Native funding (loan token must be wNative) is all-or-nothing: `nativeAmount` must equal `maxRepayAssets`, attached as `tx.value`, so a native repay pulls no ERC-20 — there is no additive assets mode and no share-mode carve. This direct route has no Bundler3 share-price bound. `repayWithdrawCollateral` mirrors this repay leg, then withdraws.
- `withdraw` accepts exactly one mode: assets (exact asset amount) or shares (full close, immune to interest accrual). `blueBundlesV1Withdraw` sends proceeds to the transaction sender (there is no `receiver` field); reallocation penalties and any referral fee reduce them. This direct route has no Bundler3 share-price bound.
- `repayWithdrawCollateral` repays first, then withdraws — never the other order.
- `supply` has no Bundler3 share-price bound on the direct BlueBundlesV1 route: `assets` is the gross funded amount and the referral fee is deducted before supplying.
- `borrow` and `supplyCollateralBorrow` enforce a post-operation `maxLtv` bound inside BlueBundlesV1 (there is no Bundler3 `minSharePrice`); the entity derives it from the buffered market LLTV (`LLTV − DEFAULT_LLTV_BUFFER`).

## Required pre-conditions

Enforced by the entity layer's `getRequirements`; see [`entities/blue/AGENTS.md`](../../entities/blue/AGENTS.md):

- `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, `withdrawCollateral`, and `refinance` require **BlueBundlesV1** to be authorized on Morpho (`setAuthorization`) — the same operator loan-asset `withdraw` uses. When an `authorizationSignature` is passed, the BlueBundlesV1 calls embed the signed-authorization struct directly in their calldata (as `blueBundlesV1Withdraw` does), removing the standalone `setAuthorization` transaction; `refinance` embeds it the same way, inside its `blueBundlesV1MigrateBorrowPosition` calldata.
- Native funding requires the collateral token (collateral-supply paths) or the loan token (`supply`, `repay`, `repayWithdrawCollateral`) to be the configured wNative for the chain; it is attached to the single payable BlueBundlesV1 call as `tx.value`.

Reallocation rules: see [`actions/AGENTS.md`](../AGENTS.md#shared-liquidity--reallocations-canonical-statement) for the canonical contract.
