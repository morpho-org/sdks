[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV1MigrateToV2Params

# Interface: VaultV1MigrateToV2Params

Defined in: [packages/morpho-sdk/src/actions/vaultV1/migrateToV2.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV1/migrateToV2.ts#L18)

Parameters for [vaultV1MigrateToV2](../functions/vaultV1MigrateToV2.md).

## Properties

### args

> **args**: `object`

Defined in: [packages/morpho-sdk/src/actions/vaultV1/migrateToV2.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV1/migrateToV2.ts#L25)

#### maxSharePriceVaultV2

> **maxSharePriceVaultV2**: `bigint`

Maximum acceptable share price for V2 deposit (inflation protection, in RAY).

#### minSharePriceVaultV1

> **minSharePriceVaultV1**: `bigint`

Minimum acceptable share price for V1 redeem (slippage protection, in RAY).

#### recipient

> **recipient**: `` `0x${string}` ``

Receives the V2 vault shares.

#### requirementSignature?

> `optional` **requirementSignature?**: [`PermitRequirementSignature`](PermitRequirementSignature.md)

Pre-signed permit/permit2 approval for V1 share transfer.

#### shares

> **shares**: `bigint`

Number of V1 shares to migrate.

#### targetAsset

> **targetAsset**: `` `0x${string}` ``

Underlying asset of the target V2 vault.

#### targetVault

> **targetVault**: `` `0x${string}` ``

***

### metadata?

> `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/vaultV1/migrateToV2.ts:40](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV1/migrateToV2.ts#L40)

***

### vault

> **vault**: `object`

Defined in: [packages/morpho-sdk/src/actions/vaultV1/migrateToV2.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV1/migrateToV2.ts#L19)

#### address

> **address**: `` `0x${string}` ``

#### asset

> **asset**: `` `0x${string}` ``

Underlying asset of the source V1 vault.

#### chainId

> **chainId**: `number`
