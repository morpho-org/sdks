[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV2InKindRedeemAction

# Interface: VaultV2InKindRedeemAction

Defined in: [packages/morpho-sdk/src/types/action.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L57)

Metadata for a Vault V2 in-kind redemption into Morpho Blue supply positions.

## Extends

- [`BaseAction`](BaseAction.md)\<`"vaultV2InKindRedeem"`, \{ `adapter`: `Address`; `amount`: `bigint`; `deadline`: `bigint`; `marketParamsList`: readonly [`InputMarketParams`](../../../blue-sdk/src/type-aliases/InputMarketParams.md)[]; `onBehalf`: `Address`; `vault`: `Address`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### adapter

> `readonly` **adapter**: `` `0x${string}` ``

#### amount

> `readonly` **amount**: `bigint`

#### deadline

> `readonly` **deadline**: `bigint`

#### marketParamsList

> `readonly` **marketParamsList**: readonly [`InputMarketParams`](../../../blue-sdk/src/type-aliases/InputMarketParams.md)[]

#### onBehalf

> `readonly` **onBehalf**: `` `0x${string}` ``

#### vault

> `readonly` **vault**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"vaultV2InKindRedeem"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
