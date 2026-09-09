[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV2ForceWithdrawAction

# Interface: VaultV2ForceWithdrawAction

Defined in: [packages/morpho-sdk/src/types/action.ts:70](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L70)

## Extends

- [`BaseAction`](BaseAction.md)\<`"vaultV2ForceWithdraw"`, \{ `deallocations`: readonly [`Deallocation`](Deallocation.md)[]; `onBehalf`: `Address`; `vault`: `Address`; `withdraw`: \{ `amount`: `bigint`; `recipient`: `Address`; \}; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### deallocations

> **deallocations**: readonly [`Deallocation`](Deallocation.md)[]

#### onBehalf

> **onBehalf**: `` `0x${string}` ``

#### vault

> **vault**: `` `0x${string}` ``

#### withdraw

> **withdraw**: `object`

##### withdraw.amount

> **amount**: `bigint`

##### withdraw.recipient

> **recipient**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"vaultV2ForceWithdraw"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
