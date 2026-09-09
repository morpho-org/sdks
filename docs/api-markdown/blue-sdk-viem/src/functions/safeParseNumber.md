[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / safeParseNumber

# Function: safeParseNumber()

> **safeParseNumber**(`value`, `decimals?`): `bigint`

Defined in: [packages/blue-sdk-viem/src/utils.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/utils.ts#L41)

Parses a JavaScript number into token units without scientific notation drift.

## Parameters

### value

`number`

Decimal number to parse.

### decimals?

`number` = `18`

Optional token decimals; defaults to 18.

## Returns

`bigint`

The parsed bigint scaled by `decimals`.

## Example

```ts
import { safeParseNumber } from "@morpho-org/blue-sdk-viem";

const amount = safeParseNumber(1.25, 6);
```
