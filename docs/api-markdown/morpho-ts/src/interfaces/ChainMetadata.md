[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / ChainMetadata

# Interface: ChainMetadata

Defined in: [packages/morpho-ts/src/chain.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L49)

Explorer, native currency, and identifier metadata for a supported chain.

## Properties

### explorerUrl

> `readonly` **explorerUrl**: `string`

Defined in: [packages/morpho-ts/src/chain.ts:52](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L52)

***

### hasReliableNativeBalance?

> `readonly` `optional` **hasReliableNativeBalance?**: `boolean`

Defined in: [packages/morpho-ts/src/chain.ts:60](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L60)

Whether eth_getBalance returns a reliable value. Defaults to true.

***

### id

> `readonly` **id**: [`ChainId`](../enumerations/ChainId.md)

Defined in: [packages/morpho-ts/src/chain.ts:51](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L51)

***

### identifier

> `readonly` **identifier**: `string`

Defined in: [packages/morpho-ts/src/chain.ts:58](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L58)

***

### name

> `readonly` **name**: `string`

Defined in: [packages/morpho-ts/src/chain.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L50)

***

### nativeCurrency

> `readonly` **nativeCurrency**: `object`

Defined in: [packages/morpho-ts/src/chain.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/chain.ts#L53)

#### decimals

> `readonly` **decimals**: `number`

#### name

> `readonly` **name**: `string`

#### symbol

> `readonly` **symbol**: `string`
