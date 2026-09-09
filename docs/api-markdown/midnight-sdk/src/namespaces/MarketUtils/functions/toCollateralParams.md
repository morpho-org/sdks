[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [MarketUtils](../README.md) / toCollateralParams

# Function: toCollateralParams()

> **toCollateralParams**(`params`): [`CollateralParams`](../../../interfaces/CollateralParams.md)

Defined in: [packages/midnight-sdk/src/market/MarketUtils.ts:104](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/MarketUtils.ts#L104)

Converts collateral params from a plain input or ABI tuple.

## Parameters

### params

`CollateralParamsInput`

## Returns

[`CollateralParams`](../../../interfaces/CollateralParams.md)

Collateral params with bigint fields.

## Example

```ts
import { MarketUtils } from "@morpho-org/midnight-sdk";

const collateral = MarketUtils.toCollateralParams({
  token: "0x0000000000000000000000000000000000000001",
  lltv: 770000000000000000n,
  liquidationCursor: 250000000000000000n,
  oracle: "0x0000000000000000000000000000000000000002",
});
console.log(collateral.liquidationCursor);
```
