[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultConfig

# Class: VaultConfig

Defined in: [packages/blue-sdk/src/vault/VaultConfig.ts:11](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultConfig.ts#L11)

Represents immutable MetaMorpho vault token configuration.

## Extends

- [`Token`](Token.md)

## Implements

- [`IVaultConfig`](../interfaces/IVaultConfig.md)

## Constructors

### Constructor

> **new VaultConfig**(`__namedParameters`): `VaultConfig`

Defined in: [packages/blue-sdk/src/vault/VaultConfig.ts:15](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultConfig.ts#L15)

#### Parameters

##### \_\_namedParameters

[`IVaultConfig`](../interfaces/IVaultConfig.md)

#### Returns

`VaultConfig`

#### Overrides

[`Token`](Token.md).[`constructor`](Token.md#constructor)

## Properties

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Token.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L28)

The token's address.

#### Implementation of

[`IVaultConfig`](../interfaces/IVaultConfig.md).[`address`](../interfaces/IVaultConfig.md#address)

#### Inherited from

[`Token`](Token.md).[`address`](Token.md#address)

***

### asset

> `readonly` **asset**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/VaultConfig.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultConfig.ts#L13)

#### Implementation of

[`IVaultConfig`](../interfaces/IVaultConfig.md).[`asset`](../interfaces/IVaultConfig.md#asset)

***

### decimals

> `readonly` **decimals**: `number`

Defined in: [packages/blue-sdk/src/token/Token.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L43)

The token's number of decimals. Defaults to 0.

#### Inherited from

[`Token`](Token.md).[`decimals`](Token.md#decimals)

***

### decimalsOffset

> `readonly` **decimalsOffset**: `bigint`

Defined in: [packages/blue-sdk/src/vault/VaultConfig.ts:12](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultConfig.ts#L12)

#### Implementation of

[`IVaultConfig`](../interfaces/IVaultConfig.md).[`decimalsOffset`](../interfaces/IVaultConfig.md#decimalsoffset)

***

### eip5267Domain?

> `readonly` `optional` **eip5267Domain?**: [`Eip5267Domain`](Eip5267Domain.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L48)

The eip712 domain of the token if it can be directly queried onchain

#### Implementation of

[`IVaultConfig`](../interfaces/IVaultConfig.md).[`eip5267Domain`](../interfaces/IVaultConfig.md#eip5267domain)

#### Inherited from

[`Token`](Token.md).[`eip5267Domain`](Token.md#eip5267domain)

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L33)

The token's name.

#### Implementation of

[`IVaultConfig`](../interfaces/IVaultConfig.md).[`name`](../interfaces/IVaultConfig.md#name)

#### Inherited from

[`Token`](Token.md).[`name`](Token.md#name)

***

### price?

> `optional` **price?**: `bigint`

Defined in: [packages/blue-sdk/src/token/Token.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L53)

Price of the token in USD (scaled by WAD).

#### Implementation of

[`IVaultConfig`](../interfaces/IVaultConfig.md).[`price`](../interfaces/IVaultConfig.md#price)

#### Inherited from

[`Token`](Token.md).[`price`](Token.md#price)

***

### symbol?

> `readonly` `optional` **symbol?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L38)

The token's symbol.

#### Implementation of

[`IVaultConfig`](../interfaces/IVaultConfig.md).[`symbol`](../interfaces/IVaultConfig.md#symbol)

#### Inherited from

[`Token`](Token.md).[`symbol`](Token.md#symbol)

## Methods

### fromUsd()

> **fromUsd**(`amount`, `rounding?`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/token/Token.ts:77](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L77)

Quotes an amount in USD (scaled by WAD) in this token.
Returns `undefined` iff the token's price is undefined.

#### Parameters

##### amount

`bigint`

The amount of USD to quote.

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Down"`

#### Returns

`bigint` \| `undefined`

#### Inherited from

[`Token`](Token.md).[`fromUsd`](Token.md#fromusd)

***

### toUsd()

> **toUsd**(`amount`, `rounding?`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/token/Token.ts:93](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L93)

Quotes an amount of tokens in USD (scaled by WAD).
Returns `undefined` iff the token's price is undefined.

#### Parameters

##### amount

`bigint`

The amount of tokens to quote.

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Down"`

#### Returns

`bigint` \| `undefined`

#### Inherited from

[`Token`](Token.md).[`toUsd`](Token.md#tousd)

***

### native()

> `static` **native**(`chainId`): [`Token`](Token.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L19)

#### Parameters

##### chainId

[`ChainId`](../../../morpho-ts/src/enumerations/ChainId.md)

#### Returns

[`Token`](Token.md)

#### Inherited from

[`Token`](Token.md).[`native`](Token.md#native)
