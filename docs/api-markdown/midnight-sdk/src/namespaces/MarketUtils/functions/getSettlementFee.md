[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getSettlementFee

# Function: getSettlementFee()

> **getSettlementFee**(`params`): `bigint`

Defined in: [packages/midnight-sdk/src/market/MarketUtils.ts:285](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/MarketUtils.ts#L285)

Computes the Midnight settlement fee from market cbp buckets and time to maturity.

This mirrors Midnight `settlementFee`: cbp buckets are scaled by [CBP](../../../variables/CBP.md),
values are linearly interpolated between [SETTLEMENT\_FEE\_BREAKPOINTS](../../../variables/SETTLEMENT_FEE_BREAKPOINTS.md),
and any time to maturity at or above 360 days uses the last bucket.

## Parameters

### params

#### settlementFeeCbps

[`SettlementFeeCbps`](../../../type-aliases/SettlementFeeCbps.md)

Seven settlement-fee centibip buckets from the market state.

#### timeToMaturity

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Seconds until market maturity.

## Returns

`bigint`

WAD-scaled settlement fee.

## Throws

when `timeToMaturity` is negative.

## Example

```ts
import { MarketUtils } from "@morpho-org/midnight-sdk";

const fee = MarketUtils.getSettlementFee({
  settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
  timeToMaturity: 12n * 60n * 60n,
});
console.log(fee);
```
