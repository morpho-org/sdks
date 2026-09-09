[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultV2BlueMarketPublicAllocatorConfig

# Class: VaultV2BlueMarketPublicAllocatorConfig

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:34](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L34)

Represents BluePublicAllocator state for one Vault V2 adapter-market pair.

## Example

```ts
import { VaultV2BlueMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";

const config = new VaultV2BlueMarketPublicAllocatorConfig({
  vault: "0x0000000000000000000000000000000000000001",
  adapter: "0x0000000000000000000000000000000000000002",
  adapterMarketCapId: "0x0000000000000000000000000000000000000000000000000000000000000003",
  absoluteCap: 100n,
  canPullFromMarket: true,
});
```

## Implements

- [`IVaultV2BlueMarketPublicAllocatorConfig`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md)

## Constructors

### Constructor

> **new VaultV2BlueMarketPublicAllocatorConfig**(`config`): `VaultV2BlueMarketPublicAllocatorConfig`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L53)

Creates an adapter-market BluePublicAllocator configuration.

#### Parameters

##### config

[`IVaultV2BlueMarketPublicAllocatorConfig`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md)

Plain adapter-market allocator configuration.

#### Returns

`VaultV2BlueMarketPublicAllocatorConfig`

## Properties

### absoluteCap

> `readonly` **absoluteCap**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:44](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L44)

Maximum post-state allocation accepted by the allocator.

#### Implementation of

[`IVaultV2BlueMarketPublicAllocatorConfig`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md).[`absoluteCap`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md#absolutecap)

***

### adapter

> `readonly` **adapter**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:40](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L40)

Vault V2 MorphoMarketV1AdapterV2 address.

#### Implementation of

[`IVaultV2BlueMarketPublicAllocatorConfig`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md).[`adapter`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md#adapter)

***

### adapterMarketCapId

> `readonly` **adapterMarketCapId**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:42](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L42)

Adapter-scoped market-parameters id used by the allocator mappings.

#### Implementation of

[`IVaultV2BlueMarketPublicAllocatorConfig`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md).[`adapterMarketCapId`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md#adaptermarketcapid)

***

### canPullFromMarket

> `readonly` **canPullFromMarket**: `boolean`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:46](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L46)

Whether the allocator may pull assets from this adapter-market pair.

#### Implementation of

[`IVaultV2BlueMarketPublicAllocatorConfig`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md).[`canPullFromMarket`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md#canpullfrommarket)

***

### vault

> `readonly` **vault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L38)

Configured Vault V2 address.

#### Implementation of

[`IVaultV2BlueMarketPublicAllocatorConfig`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md).[`vault`](../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md#vault)

## Methods

### getMaxIn()

> **getMaxIn**(`allocation`): `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:87](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L87)

Computes the assets that may still be allocated under the allocator cap.

#### Parameters

##### allocation

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Effective current allocation, including untracked assets.

#### Returns

`bigint`

Remaining allocator capacity, floored at zero.

#### Example

```ts
import { VaultV2BlueMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";

const config = new VaultV2BlueMarketPublicAllocatorConfig({
  vault: "0x0000000000000000000000000000000000000001",
  adapter: "0x0000000000000000000000000000000000000002",
  adapterMarketCapId: "0x0000000000000000000000000000000000000000000000000000000000000003",
  absoluteCap: 100n,
  canPullFromMarket: true,
});
const maxIn = config.getMaxIn(40n);
// maxIn === 60n
```
