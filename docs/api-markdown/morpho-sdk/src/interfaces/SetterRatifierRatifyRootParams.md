[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / SetterRatifierRatifyRootParams

# Interface: SetterRatifierRatifyRootParams

Defined in: [packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts:12](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts#L12)

Parameters for [setterRatifierRatifyRoot](../functions/setterRatifierRatifyRoot.md).

## Properties

### chainId

> `readonly` **chainId**: `number`

Defined in: [packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts#L14)

Chain id used to resolve the SetterRatifier deployment.

***

### isRootRatified?

> `readonly` `optional` **isRootRatified?**: `boolean`

Defined in: [packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts#L20)

Whether the root should be ratified. Defaults to `true`.

***

### maker

> `readonly` **maker**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts#L16)

Maker whose offer-tree root is being ratified.

***

### metadata?

> `readonly` `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts#L22)

Optional metadata appended to the transaction calldata.

***

### root

> `readonly` **root**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/setterRatifierRatifyRoot.ts#L18)

Offer-tree root to ratify or unratify.
