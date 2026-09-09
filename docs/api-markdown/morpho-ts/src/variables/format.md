[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / format

# Variable: format

> `const` **format**: `object` & `object`

Defined in: [packages/morpho-ts/src/format/format/format.ts:936](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L936)

Default formatter collection with hex, number, commas, short, and percent formatters.

## Type Declaration

### commas

> `readonly` **commas**: [`CommasFormatter`](../classes/CommasFormatter.md)

Return the value as a commas-separated stringified number (12,345.6789)

### hex

> `readonly` **hex**: [`HexFormatter`](../classes/HexFormatter.md)

Return the value as an integer in hex format

### number

> `readonly` **number**: [`NumberFormatter`](../classes/NumberFormatter.md)

Return the value as a stringified number (12345.6789)

### percent

> `readonly` **percent**: [`PercentFormatter`](../classes/PercentFormatter.md)

Return the value as a percent based stringified number (10.00 instead of 0.1)

### short

> `readonly` **short**: [`ShortFormatter`](../classes/ShortFormatter.md)

Return the value as a shorted stringified number (12.3456789k)
