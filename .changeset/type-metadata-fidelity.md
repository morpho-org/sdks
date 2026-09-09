---
"@morpho-org/blue-sdk": patch
"@morpho-org/morpho-sdk": minor
"@morpho-org/liquidity-sdk-viem": patch
---

Make runtime values match their declared types and semantics:

- `ConstantWrappedToken` now honours the requested `RoundingDirection` in `_wrap`/`_unwrap` (previously always rounded down, so `"Up"` conversions between tokens with different decimals could under-quote by one unit).
- `PreLiquidationPosition.marketId` now equals `position.market.id` (the underlying Blue market) instead of the id of the internal pre-LLTV-substituted market; pre-liquidation health math is unchanged.
- Vault V1/V2 `withdraw`/`redeem` action metadata (`transaction.action.args`) now includes `onBehalf`, which was already encoded in calldata.
- `LiquidityLoader` converts the API's `targetBorrowUtilization` string to `bigint`, matching its declared return type.
