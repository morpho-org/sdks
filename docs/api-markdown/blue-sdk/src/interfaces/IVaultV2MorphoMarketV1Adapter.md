[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IVaultV2MorphoMarketV1Adapter

# Interface: IVaultV2MorphoMarketV1Adapter

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L17)

Plain input shape for a Vault V2 adapter investing in Morpho Blue markets.

## Extends

- `Omit`\<[`IVaultV2Adapter`](IVaultV2Adapter.md), `"adapterId"` \| `"type"`\>

## Extended by

- [`IAccrualVaultV2MorphoMarketV1Adapter`](IAccrualVaultV2MorphoMarketV1Adapter.md)

## Properties

### address

> **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:8](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L8)

#### Inherited from

[`IVaultV2Adapter`](IVaultV2Adapter.md).[`address`](IVaultV2Adapter.md#address)

***

### marketParamsList

> **marketParamsList**: [`IMarketParams`](IMarketParams.md)[]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L20)

***

### parentVault

> **parentVault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:9](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L9)

#### Inherited from

[`IVaultV2Adapter`](IVaultV2Adapter.md).[`parentVault`](IVaultV2Adapter.md#parentvault)

***

### skimRecipient

> **skimRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:11](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L11)

#### Inherited from

[`IVaultV2Adapter`](IVaultV2Adapter.md).[`skimRecipient`](IVaultV2Adapter.md#skimrecipient)

***

### type?

> `optional` **type?**: `"VaultV2MorphoMarketV1Adapter"`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L19)
