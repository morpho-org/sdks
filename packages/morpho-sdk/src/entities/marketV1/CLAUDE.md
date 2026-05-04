# `entities/marketV1/`

`MorphoMarketV1` implements `MarketV1Actions`. Constructor: `MorphoMarketV1(client, marketParams: MarketParams, chainId)`. Inherits [`entities/CLAUDE.md`](../CLAUDE.md).

## State reads

- `getMarketData` / `getPositionData` fetch state via `fetchMarket` / `fetchAccrualPosition`.
- `AccrualPosition` exposes `maxBorrowAssets`, `ltv`, `isHealthy`, `borrowAssets`, `collateral`.

## LLTV buffer (safety guard, asserted in tests)

`supplyCollateralBorrow` and the post-withdraw safety checks on `withdrawCollateral` and `repayWithdrawCollateral` enforce a buffer below LLTV:

- `maxSafeBorrow = collateralValue × (LLTV − DEFAULT_LLTV_BUFFER)` where `collateralValue` uses `ORACLE_PRICE_SCALE = 1e36`.
- `DEFAULT_LLTV_BUFFER` is hardcoded at 0.5% (`WAD/200`); not user-configurable.
- Throws `BorrowExceedsSafeLtvError` (carrying `borrowAmount`, `maxSafeBorrow`) when the post-borrow position would exceed the buffer.
- Throws `MissingMarketPriceError` when the oracle price is unavailable.

## Authorization requirements

`getRequirements` returns:

- ERC-20 approval for **GeneralAdapter1** on the collateral token (any path that supplies collateral).
- `morpho.setAuthorization(generalAdapter1, true)` when authorization is not yet set on Morpho — read via `publicActions`. Required for `borrow`, `supplyCollateralBorrow`, and `repayWithdrawCollateral`.

`withdrawCollateral` has no requirements. `repay` needs only loan-token approval.
