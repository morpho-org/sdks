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

- Token funding authorization for **BlueBundlesV1**. Classic approval and ERC-2612 name the
  registered fixed contract directly. Permit2 SignatureTransfer first ensures the token allowance
  to canonical Permit2, then returns a one-time signature requirement naming BlueBundlesV1.
- `morpho.setAuthorization(blueBundlesV1, true)` when the fixed contract is not yet authorized on
  Morpho. With signature support, the prepared call consumes the signed authorization directly.
- No separate user funding requirement for BluePublicAllocator penalties; BlueBundlesV1 accounts
  for them within the fixed operation.

When `supportSignature` is enabled on the client, the authorization requirement is returned as a
signable `Requirement` instead of a transaction. `buildTx` accepts the resulting token and Morpho
authorization signatures and encodes them into the direct BlueBundlesV1 call.

Native funding is valid only for the chain's configured wNative token and emits no ERC-20 funding
requirement.
