[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / isMarketId

# Function: isMarketId()

> **isMarketId**(`value`): `value is MarketId`

Defined in: [packages/blue-sdk/src/types.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/types.ts#L53)

Checks whether a value is a 32-byte Morpho Blue market id.

## Parameters

### value

`unknown`

The unknown value to inspect.

## Returns

`value is MarketId`

`true` when `value` is a `0x`-prefixed 32-byte hex string.

## Example

```ts
import { isMarketId } from "@morpho-org/blue-sdk";

const valid = isMarketId("0x0000000000000000000000000000000000000000000000000000000000000000");
// valid satisfies boolean
```
