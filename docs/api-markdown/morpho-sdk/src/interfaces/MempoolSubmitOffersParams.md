[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MempoolSubmitOffersParams

# Interface: MempoolSubmitOffersParams

Defined in: [packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts:12](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts#L12)

Parameters for publishing an already ratified Midnight offer payload.

## Properties

### chainId

> `readonly` **chainId**: `number`

Defined in: [packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts#L13)

***

### groups

> `readonly` **groups**: readonly `` `0x${string}` ``[]

Defined in: [packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts#L14)

***

### maker

> `readonly` **maker**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts#L16)

***

### metadata?

> `readonly` `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts#L21)

***

### offers

> `readonly` **offers**: `number`

Defined in: [packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts#L19)

***

### payload

> `readonly` **payload**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts#L20)

***

### ratifier

> `readonly` **ratifier**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts#L17)

***

### ratifierType

> `readonly` **ratifierType**: `"ecrecover"` \| `"setter"`

Defined in: [packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts#L18)

***

### root

> `readonly` **root**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts:15](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts#L15)
