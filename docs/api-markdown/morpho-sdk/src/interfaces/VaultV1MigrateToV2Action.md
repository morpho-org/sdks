[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV1MigrateToV2Action

# Interface: VaultV1MigrateToV2Action

Defined in: [packages/morpho-sdk/src/types/action.ts:137](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L137)

## Extends

- [`BaseAction`](BaseAction.md)\<`"vaultV1MigrateToV2"`, \{ `maxSharePriceVaultV2`: `bigint`; `minSharePriceVaultV1`: `bigint`; `recipient`: `Address`; `shares`: `bigint`; `sourceVault`: `Address`; `targetVault`: `Address`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### maxSharePriceVaultV2

> **maxSharePriceVaultV2**: `bigint`

#### minSharePriceVaultV1

> **minSharePriceVaultV1**: `bigint`

#### recipient

> **recipient**: `` `0x${string}` ``

#### shares

> **shares**: `bigint`

#### sourceVault

> **sourceVault**: `` `0x${string}` ``

#### targetVault

> **targetVault**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"vaultV1MigrateToV2"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
