[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultUser

# Class: VaultUser

Defined in: [packages/blue-sdk/src/vault/VaultUser.ts:12](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultUser.ts#L12)

Represents a user's MetaMorpho vault allocator and allowance state.

## Implements

- [`IVaultUser`](../interfaces/IVaultUser.md)

## Constructors

### Constructor

> **new VaultUser**(`__namedParameters`): `VaultUser`

Defined in: [packages/blue-sdk/src/vault/VaultUser.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultUser.ts#L33)

#### Parameters

##### \_\_namedParameters

[`IVaultUser`](../interfaces/IVaultUser.md)

#### Returns

`VaultUser`

## Properties

### allowance

> **allowance**: `bigint`

Defined in: [packages/blue-sdk/src/vault/VaultUser.ts:31](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultUser.ts#L31)

The allowance of the vault over the user's underlying assets.

#### Implementation of

[`IVaultUser`](../interfaces/IVaultUser.md).[`allowance`](../interfaces/IVaultUser.md#allowance)

***

### isAllocator

> **isAllocator**: `boolean`

Defined in: [packages/blue-sdk/src/vault/VaultUser.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultUser.ts#L26)

Whether the user is an allocator of the vault.

#### Implementation of

[`IVaultUser`](../interfaces/IVaultUser.md).[`isAllocator`](../interfaces/IVaultUser.md#isallocator)

***

### user

> `readonly` **user**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/VaultUser.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultUser.ts#L21)

The user's address.

#### Implementation of

[`IVaultUser`](../interfaces/IVaultUser.md).[`user`](../interfaces/IVaultUser.md#user)

***

### vault

> `readonly` **vault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/VaultUser.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultUser.ts#L16)

The vault's address.

#### Implementation of

[`IVaultUser`](../interfaces/IVaultUser.md).[`vault`](../interfaces/IVaultUser.md#vault)
