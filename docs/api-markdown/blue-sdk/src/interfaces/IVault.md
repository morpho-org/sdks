[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IVault

# Interface: IVault

Defined in: [packages/blue-sdk/src/vault/Vault.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L37)

Plain input shape for a MetaMorpho vault.

## Extends

- [`IVaultConfig`](IVaultConfig.md)

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

#### Inherited from

[`IVaultConfig`](IVaultConfig.md).[`asset`](IVaultConfig.md#asset)

***

### curator

> **curator**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L38)

***

### decimalsOffset

> **decimalsOffset**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/blue-sdk/src/vault/VaultConfig.ts:6](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultConfig.ts#L6)

#### Inherited from

[`IVaultConfig`](IVaultConfig.md).[`decimalsOffset`](IVaultConfig.md#decimalsoffset)

***

### eip5267Domain?

> `optional` **eip5267Domain?**: [`Eip5267Domain`](../classes/Eip5267Domain.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L14)

#### Inherited from

[`IToken`](IToken.md).[`eip5267Domain`](IToken.md#eip5267domain)

***

### fee

> **fee**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L41)

***

### feeRecipient

> **feeRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:42](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L42)

***

### guardian

> **guardian**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:40](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L40)

***

### lastTotalAssets

> **lastTotalAssets**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:52](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L52)

***

### lostAssets?

> `optional` **lostAssets?**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L53)

***

### name?

> `optional` **name?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:10](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L10)

#### Inherited from

[`IToken`](IToken.md).[`name`](IToken.md#name)

***

### owner

> **owner**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L39)

***

### pendingGuardian

> **pendingGuardian**: [`Pending`](Pending.md)\<`` `0x${string}` ``\>

Defined in: [packages/blue-sdk/src/vault/Vault.ts:45](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L45)

***

### pendingOwner

> **pendingOwner**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:46](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L46)

***

### pendingTimelock

> **pendingTimelock**: [`Pending`](Pending.md)\<`bigint`\>

Defined in: [packages/blue-sdk/src/vault/Vault.ts:44](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L44)

***

### price?

> `optional` **price?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/blue-sdk/src/token/Token.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L13)

#### Inherited from

[`IToken`](IToken.md).[`price`](IToken.md#price)

***

### publicAllocatorConfig?

> `optional` **publicAllocatorConfig?**: [`VaultPublicAllocatorConfig`](VaultPublicAllocatorConfig.md)

Defined in: [packages/blue-sdk/src/vault/Vault.ts:54](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L54)

***

### skimRecipient

> **skimRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/Vault.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L43)

***

### supplyQueue

> **supplyQueue**: [`MarketId`](../type-aliases/MarketId.md)[]

Defined in: [packages/blue-sdk/src/vault/Vault.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L48)

***

### symbol?

> `optional` **symbol?**: `string`

Defined in: [packages/blue-sdk/src/token/Token.ts:11](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/token/Token.ts#L11)

#### Inherited from

[`IToken`](IToken.md).[`symbol`](IToken.md#symbol)

***

### timelock

> **timelock**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:47](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L47)

***

### totalAssets

> **totalAssets**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:51](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L51)

***

### totalSupply

> **totalSupply**: `bigint`

Defined in: [packages/blue-sdk/src/vault/Vault.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L50)

***

### withdrawQueue

> **withdrawQueue**: [`MarketId`](../type-aliases/MarketId.md)[]

Defined in: [packages/blue-sdk/src/vault/Vault.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/Vault.ts#L49)
