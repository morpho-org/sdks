[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / safeParseUnits

# Function: safeParseUnits()

> **safeParseUnits**(`strValue`, `decimals?`): `bigint`

Defined in: [packages/blue-sdk-viem/src/utils.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/utils.ts#L57)

Parses a decimal string into token units, truncating extra fractional digits.

## Parameters

### strValue

`string`

Decimal string to parse.

### decimals?

`number` = `18`

Optional token decimals; defaults to 18.

## Returns

`bigint`

The parsed bigint scaled by `decimals`.

## Example

```ts
import { safeParseUnits } from "@morpho-org/blue-sdk-viem";

const amount = safeParseUnits("1.25", 6);
```
