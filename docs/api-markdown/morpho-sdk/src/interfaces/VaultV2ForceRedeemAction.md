[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV2ForceRedeemAction

# Interface: VaultV2ForceRedeemAction

Defined in: [packages/morpho-sdk/src/types/action.ts:81](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L81)

## Extends

- [`BaseAction`](BaseAction.md)\<`"vaultV2ForceRedeem"`, \{ `deallocations`: readonly [`Deallocation`](Deallocation.md)[]; `onBehalf`: `Address`; `redeem`: \{ `recipient`: `Address`; `shares`: `bigint`; \}; `vault`: `Address`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### deallocations

> **deallocations**: readonly [`Deallocation`](Deallocation.md)[]

#### onBehalf

> **onBehalf**: `` `0x${string}` ``

#### redeem

> **redeem**: `object`

##### redeem.recipient

> **recipient**: `` `0x${string}` ``

##### redeem.shares

> **shares**: `bigint`

#### vault

> **vault**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"vaultV2ForceRedeem"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
