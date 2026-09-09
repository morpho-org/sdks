[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV2InKindRedeemParams

# Interface: VaultV2InKindRedeemParams

Defined in: [packages/morpho-sdk/src/actions/vaultV2/inKindRedeem.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/inKindRedeem.ts#L16)

Parameters for [vaultV2InKindRedeem](../functions/vaultV2InKindRedeem.md).

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/actions/vaultV2/inKindRedeem.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/inKindRedeem.ts#L18)

#### adapter

> `readonly` **adapter**: `` `0x${string}` ``

#### amount

> `readonly` **amount**: `bigint`

#### deadline

> `readonly` **deadline**: `bigint`

#### marketParamsList

> `readonly` **marketParamsList**: readonly [`InputMarketParams`](../../../blue-sdk/src/type-aliases/InputMarketParams.md)[]

#### requirementSignature?

> `readonly` `optional` **requirementSignature?**: [`PermitRequirementSignature`](PermitRequirementSignature.md)

#### userAddress

> `readonly` **userAddress**: `` `0x${string}` ``

***

### metadata?

> `readonly` `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/vaultV2/inKindRedeem.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/inKindRedeem.ts#L26)

***

### vault

> `readonly` **vault**: `object`

Defined in: [packages/morpho-sdk/src/actions/vaultV2/inKindRedeem.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/inKindRedeem.ts#L17)

#### address

> `readonly` **address**: `` `0x${string}` ``

#### chainId

> `readonly` **chainId**: `number`
