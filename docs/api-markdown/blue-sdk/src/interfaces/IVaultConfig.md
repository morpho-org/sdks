[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IVaultConfig

# Interface: IVaultConfig

Defined in: [packages/blue-sdk/src/vault/VaultConfig.ts:5](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultConfig.ts#L5)

Plain input shape for immutable MetaMorpho vault token configuration.

## Extends

- `Omit`\<[`IToken`](IToken.md), `"decimals"`\>

## Extended by

- [`IVault`](IVault.md)

## Properties

### address

> **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/token/Token.ts:9](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L9)

#### Inherited from

[`IToken`](IToken.md).[`address`](IToken.md#address)

***

### asset

> **asset**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/VaultConfig.ts:7](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultConfig.ts#L7)

***

### decimalsOffset

> **decimalsOffset**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/blue-sdk/src/vault/VaultConfig.ts:6](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultConfig.ts#L6)

***

### eip5267Domain?

> `optional` **eip5267Domain?**: [`Eip5267Domain`](../classes/Eip5267Domain.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L14)

#### Inherited from

[`IToken`](IToken.md).[`eip5267Domain`](IToken.md#eip5267domain)

***

### name?

> `optional` **name?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:10](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L10)

#### Inherited from

[`IToken`](IToken.md).[`name`](IToken.md#name)

***

### price?

> `optional` **price?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L13)

#### Inherited from

[`IToken`](IToken.md).[`price`](IToken.md#price)

***

### symbol?

> `optional` **symbol?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:11](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L11)

#### Inherited from

[`IToken`](IToken.md).[`symbol`](IToken.md#symbol)
