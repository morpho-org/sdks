[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / FieldType

# Type Alias: FieldType\<T, Path\>

> **FieldType**\<`T`, `Path`\> = `T` *extends* `null` ? `FieldType`\<`Exclude`\<`T`, `null`\>, `Path`\> \| `null` : `T` *extends* `undefined` ? `FieldType`\<`Exclude`\<`T`, `undefined`\>, `Path`\> \| `undefined` : `Path` *extends* keyof `T` ? `T`\[`Path`\] : `Path` *extends* `` `${infer Left}.${infer Right}` `` ? `Left` *extends* keyof `T` ? `FieldType`\<`T`\[`Left`\], `Right`\> : `never` : `never`

Defined in: [packages/morpho-ts/src/types.ts:79](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/types.ts#L79)

Resolves the field type addressed by a dot-separated path.

## Type Parameters

### T

`T`

### Path

`Path` = [`PartialDottedKeys`](PartialDottedKeys.md)\<`T`\>
