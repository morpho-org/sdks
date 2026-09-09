[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getLiquidationIncentiveFactor

# Function: getLiquidationIncentiveFactor()

> **getLiquidationIncentiveFactor**(`input`, `cursor`): `bigint`

Defined in: [packages/midnight-sdk/src/market/MarketUtils.ts:245](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/MarketUtils.ts#L245)

Returns the liquidation incentive factor for an LLTV and liquidation cursor.

## Parameters

### input

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md) \| `Pick`\<`CollateralParamsInput`, `"lltv"`\>

WAD-scaled LLTV or collateral params carrying an LLTV.

### cursor

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

WAD-scaled liquidation cursor.

## Returns

`bigint`

WAD-scaled liquidation incentive factor.

## Example

```ts
import { MarketUtils } from "@morpho-org/midnight-sdk";

const liquidationIncentiveFactor = MarketUtils.getLiquidationIncentiveFactor(
  770000000000000000n,
  250000000000000000n,
);
console.log(liquidationIncentiveFactor);
```
