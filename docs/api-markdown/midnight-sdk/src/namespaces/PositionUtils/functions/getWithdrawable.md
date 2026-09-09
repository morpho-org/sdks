[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [PositionUtils](../README.md) / getWithdrawable

# Function: getWithdrawable()

> **getWithdrawable**(`params`): `bigint`

Defined in: [packages/midnight-sdk/src/position/PositionUtils.ts:84](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/PositionUtils.ts#L84)

Returns the maximum credit units currently withdrawable by a position.

## Parameters

### params

#### market

`Pick`\<[`IMarket`](../../../interfaces/IMarket.md), `"withdrawable"`\>

Market whose available liquidity limits the withdrawal.

#### position

`Pick`\<[`IPosition`](../../../interfaces/IPosition.md), `"credit"`\>

Position whose credit limits the withdrawal.

## Returns

`bigint`

The lower of the position credit and market withdrawable liquidity.

## Example

```ts
import { PositionUtils } from "@morpho-org/midnight-sdk";

const withdrawable = PositionUtils.getWithdrawable({
  position: { credit: 1_000n },
  market: { withdrawable: 500n },
});
console.log(withdrawable); // 500n
```
