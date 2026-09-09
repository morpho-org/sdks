[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / createFormat

# Function: createFormat()

> **createFormat**\<`TCustom`\>(`defaultOptions?`, `customFormatters?`): `object` & \{ readonly \[K in string \| number \| symbol\]: TFormatters\[TCustom\[K\]\["format"\]\] \}

Defined in: [packages/morpho-ts/src/format/format/format.ts:849](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L849)

Creates a set of pre-configured formatters for various numeric formats.

The `createFormat` function generates formatters for hex, number, commas-separated, short, and percentage formats.
It allows setting default options for all formatters and defining custom formatters for specific use cases.

## Type Parameters

### TCustom

`TCustom` *extends* `Record`\<`string`, `FormatShortOptions` \| `FormatHexOptions` \| `FormatCommasOptions` \| `FormatNumberOptions` \| `FormatPercentOptions`\> & `object` = \{ \}

A custom configuration object where keys are custom formatter names and values are
                     format options specific to the desired format.

## Parameters

### defaultOptions?

`Partial`\<`TDefaultOptions`\> = `{}`

Default options to apply to all formatters or specific format types.

### customFormatters?

`TCustom` = `...`

An object defining additional custom formatters with specific configurations.

## Returns

An object containing pre-configured formatters and custom formatters if provided.

## Examples

```ts
// Create default formatters
const format = createFormat();
console.log(format.number.of(1234.56)); // Output: "1234.56"
console.log(format.commas.of(1234.56)); // Output: "1,234.56"
```

```ts
// Create formatters with default options
const format = createFormat({
  all: { digits: 2 },
  number: { unit: "$" },
});
console.log(format.number.of(1234.56)); // Output: "$1234.56"
console.log(format.short.of(1234567.89)); // Output: "1.23M"
```

```ts
// Adding custom formatters
const format = createFormat({}, { customHex: { format: Format.hex, prefix: true } });
console.log(format.customHex.of(255)); // Output: "0xff"
```
