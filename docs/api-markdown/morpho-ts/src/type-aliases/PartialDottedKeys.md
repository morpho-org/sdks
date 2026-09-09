[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / PartialDottedKeys

# Type Alias: PartialDottedKeys\<T, Depth\>

> **PartialDottedKeys**\<`T`, `Depth`\> = `T` *extends* `object` \| `null` \| `undefined` ? \{ \[K in keyof T & string\]: T\[K\] extends object \| null \| undefined ? \`$\{K\}.$\{Depth extends "MAX" ? any : PartialDottedKeys\<T\[K\], Inc\<Depth\>\>\}\` \| K : K \}\[keyof `T` & `string`\] : `""`

Defined in: [packages/morpho-ts/src/types.ts:60](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/types.ts#L60)

Builds dot-separated paths for nested objects, including intermediate object keys.

## Type Parameters

### T

`T`

### Depth

`Depth` = `0`
