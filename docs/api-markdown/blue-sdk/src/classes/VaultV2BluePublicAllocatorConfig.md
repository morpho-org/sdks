[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultV2BluePublicAllocatorConfig

# Class: VaultV2BluePublicAllocatorConfig

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts#L28)

Represents one Vault V2's BluePublicAllocator configuration.

## Example

```ts
import { VaultV2BluePublicAllocatorConfig } from "@morpho-org/blue-sdk";

const config = new VaultV2BluePublicAllocatorConfig({
  vault: "0x0000000000000000000000000000000000000001",
  canPullFromIdle: true,
  penalty: 500_000_000_000_000_000n,
});
```

## Implements

- [`IVaultV2BluePublicAllocatorConfig`](../interfaces/IVaultV2BluePublicAllocatorConfig.md)

## Constructors

### Constructor

> **new VaultV2BluePublicAllocatorConfig**(`config`): `VaultV2BluePublicAllocatorConfig`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts#L43)

Creates a Vault V2 BluePublicAllocator configuration.

#### Parameters

##### config

[`IVaultV2BluePublicAllocatorConfig`](../interfaces/IVaultV2BluePublicAllocatorConfig.md)

Plain allocator configuration.

#### Returns

`VaultV2BluePublicAllocatorConfig`

## Properties

### canPullFromIdle

> `readonly` **canPullFromIdle**: `boolean`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts:34](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts#L34)

Whether the allocator may pull the vault's idle assets into a Blue market.

#### Implementation of

[`IVaultV2BluePublicAllocatorConfig`](../interfaces/IVaultV2BluePublicAllocatorConfig.md).[`canPullFromIdle`](../interfaces/IVaultV2BluePublicAllocatorConfig.md#canpullfromidle)

***

### penalty

> `readonly` **penalty**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts:36](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts#L36)

Proportional vault-asset penalty charged for each call, scaled by WAD.

#### Implementation of

[`IVaultV2BluePublicAllocatorConfig`](../interfaces/IVaultV2BluePublicAllocatorConfig.md).[`penalty`](../interfaces/IVaultV2BluePublicAllocatorConfig.md#penalty)

***

### vault

> `readonly` **vault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts#L32)

Configured Vault V2 address.

#### Implementation of

[`IVaultV2BluePublicAllocatorConfig`](../interfaces/IVaultV2BluePublicAllocatorConfig.md).[`vault`](../interfaces/IVaultV2BluePublicAllocatorConfig.md#vault)

## Methods

### getPenaltyAssets()

> **getPenaltyAssets**(`assets`): `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts:71](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts#L71)

Computes the independently rounded penalty charged for one reallocation.

#### Parameters

##### assets

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Assets reallocated by the allocator.

#### Returns

`bigint`

Penalty assets rounded up exactly as the allocator charges them.

#### Example

```ts
import { VaultV2BluePublicAllocatorConfig } from "@morpho-org/blue-sdk";

const config = new VaultV2BluePublicAllocatorConfig({
  vault: "0x0000000000000000000000000000000000000001",
  canPullFromIdle: true,
  penalty: 500_000_000_000_000_000n,
});
const penaltyAssets = config.getPenaltyAssets(3n);
// penaltyAssets === 2n
```
