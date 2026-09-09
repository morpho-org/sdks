[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV1DepositAction

# Interface: VaultV1DepositAction

Defined in: [packages/morpho-sdk/src/types/action.ts:92](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L92)

## Extends

- [`BaseAction`](BaseAction.md)\<`"vaultV1Deposit"`, \{ `amount`: `bigint`; `maxSharePrice`: `bigint`; `nativeAmount?`: `bigint`; `recipient`: `Address`; `vault`: `Address`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### amount

> **amount**: `bigint`

#### maxSharePrice

> **maxSharePrice**: `bigint`

#### nativeAmount?

> `optional` **nativeAmount?**: `bigint`

#### recipient

> **recipient**: `` `0x${string}` ``

#### vault

> **vault**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"vaultV1Deposit"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
