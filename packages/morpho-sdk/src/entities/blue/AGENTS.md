# `entities/blue/`

`MorphoBlue` implements `BlueActions`. Constructor: `MorphoBlue(client, marketParams: MarketParams, chainId)`. Inherits [`entities/AGENTS.md`](../AGENTS.md).

## State reads

- `getMarketData` / `getPositionData` fetch state via `fetchMarket` / `fetchAccrualPosition`.
- `AccrualPosition` exposes `maxBorrowAssets`, `ltv`, `isHealthy`, `borrowAssets`, `collateral`, `supplyShares`, and a derived `supplyAssets` (via `market.toSupplyAssets(supplyShares)`).

## LLTV buffer (safety guard, asserted in tests)

`supplyCollateralBorrow` and the post-withdraw safety checks on `withdrawCollateral` and `repayWithdrawCollateral` enforce a buffer below LLTV:

- `maxSafeBorrow = collateralValue × (LLTV − DEFAULT_LLTV_BUFFER)` where `collateralValue` uses `ORACLE_PRICE_SCALE = 1e36`.
- `DEFAULT_LLTV_BUFFER` is hardcoded at 0.5% (`WAD/200`); not user-configurable.
- Throws `BorrowExceedsSafeLtvError` (carrying `borrowAmount`, `maxSafeBorrow`) when the post-borrow position would exceed the buffer.
- Throws `MissingMarketPriceError` when the oracle price is unavailable.

## Authorization requirements

`getRequirements` returns:

- ERC-20 approval for **GeneralAdapter1** on the collateral token (any path that supplies collateral) or the loan token (`supply`, `repay`, `repayWithdrawCollateral`). The approved amount is the **ERC-20 portion actually pulled**, not the total: for a native-funded repay it is `amount` (assets mode) or `max(0, toBorrowAssets(shares) − nativeAmount)` (shares mode — clamped at 0 so a `nativeAmount` that covers or exceeds the borrow assets pulls nothing). A fully-native repay pulls no ERC-20, so no approval requirement is emitted; in shares mode any wrapped native beyond the on-chain repay is skimmed back to the receiver.
- A classic ERC-20 approval for **GeneralAdapter1** on the loan token when `borrow`, `supplyCollateralBorrow`, `withdraw`, or `refinance` includes BluePublicAllocator reallocations with a non-zero penalty. The approved amount is the sum of each call's independently rounded `ceil(assets × penalty / WAD)` donation. This path deliberately does not return a permit signature, so it can coexist with a collateral-token permit in `supplyCollateralBorrow`.
- `morpho.setAuthorization(generalAdapter1, true)` when authorization is not yet set on Morpho — read via `publicActions`. Required for `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, and `withdraw` (loan-asset).

When `supportSignature` is enabled on the client, the authorization requirement is returned as a signable `Requirement` instead of a transaction; signing it produces an `AuthorizationRequirementSignature` that `buildTx` consumes and folds into the bundle as a `setAuthorizationWithSig` call, so no standalone authorization transaction is needed. `buildTx` accepts a `readonly RequirementSignature[]` and splits permit vs. authorization signatures via `isPermitSignature` / `isAuthorizationSignature`.

`withdrawCollateral` has no requirements. `repay` and `supply` need only loan-token approval (native wrapping requires the loan token to be the chain's wNative). Without V2 reallocations, loan-asset `withdraw` needs only the Morpho authorization.
