[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / DottedKeys

# Type Alias: DottedKeys\<T, Depth\>

> **DottedKeys**\<`T`, `Depth`\> = `T` *extends* `object` \| `null` \| `undefined` ? \{ \[K in keyof T & string\]: T\[K\] extends object \| null \| undefined ? \`$\{K\}.$\{Depth extends "MAX" ? any : DottedKeys\<T\[K\], Inc\<Depth\>\>\}\` : K \}\[keyof `T` & `string`\] : `""`

Defined in: [packages/morpho-ts/src/types.ts:46](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/types.ts#L46)

Builds dot-separated paths for nested object leaves.

## Type Parameters

### T

`T`

### Depth

`Depth` = `0`
