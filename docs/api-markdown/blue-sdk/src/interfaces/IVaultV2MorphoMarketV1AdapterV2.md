[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IVaultV2MorphoMarketV1AdapterV2

# Interface: IVaultV2MorphoMarketV1AdapterV2

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L16)

Plain input shape for a Vault V2 Morpho Blue market adapter using market ids.

## Extends

- `Omit`\<[`IVaultV2Adapter`](IVaultV2Adapter.md), `"adapterId"` \| `"type"`\>

## Extended by

- [`IAccrualVaultV2MorphoMarketV1AdapterV2`](IAccrualVaultV2MorphoMarketV1AdapterV2.md)

## Properties

### adaptiveCurveIrm

> **adaptiveCurveIrm**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L20)

***

### address

> **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:8](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L8)

#### Inherited from

[`IVaultV2Adapter`](IVaultV2Adapter.md).[`address`](IVaultV2Adapter.md#address)

***

### marketIds

> **marketIds**: [`MarketId`](../type-aliases/MarketId.md)[]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L19)

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

### supplyShares

> **supplyShares**: `Record`\<[`MarketId`](../type-aliases/MarketId.md), `bigint`\>

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L21)

***

### type?

> `optional` **type?**: `"VaultV2MorphoMarketV1AdapterV2"`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L18)
