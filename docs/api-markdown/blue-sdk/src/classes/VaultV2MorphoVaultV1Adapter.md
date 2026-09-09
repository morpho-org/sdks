[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultV2MorphoVaultV1Adapter

# Class: VaultV2MorphoVaultV1Adapter

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L20)

Represents a Vault V2 adapter investing in a MetaMorpho V1 vault.

## Extends

- [`VaultV2Adapter`](VaultV2Adapter.md)

## Extended by

- [`AccrualVaultV2MorphoVaultV1Adapter`](AccrualVaultV2MorphoVaultV1Adapter.md)

## Implements

- [`IVaultV2MorphoVaultV1Adapter`](../interfaces/IVaultV2MorphoVaultV1Adapter.md)

## Constructors

### Constructor

> **new VaultV2MorphoVaultV1Adapter**(`__namedParameters`): `VaultV2MorphoVaultV1Adapter`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:58](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L58)

#### Parameters

##### \_\_namedParameters

[`IVaultV2MorphoVaultV1Adapter`](../interfaces/IVaultV2MorphoVaultV1Adapter.md)

#### Returns

`VaultV2MorphoVaultV1Adapter`

#### Overrides

[`VaultV2Adapter`](VaultV2Adapter.md).[`constructor`](VaultV2Adapter.md#constructor)

## Properties

### adapterId

> `readonly` **adapterId**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L19)

#### Inherited from

[`VaultV2Adapter`](VaultV2Adapter.md).[`adapterId`](VaultV2Adapter.md#adapterid)

***

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L17)

#### Implementation of

[`IVaultV2MorphoVaultV1Adapter`](../interfaces/IVaultV2MorphoVaultV1Adapter.md).[`address`](../interfaces/IVaultV2MorphoVaultV1Adapter.md#address)

#### Inherited from

[`VaultV2Adapter`](VaultV2Adapter.md).[`address`](VaultV2Adapter.md#address)

***

### morphoVaultV1

> `readonly` **morphoVaultV1**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:56](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L56)

#### Implementation of

[`IVaultV2MorphoVaultV1Adapter`](../interfaces/IVaultV2MorphoVaultV1Adapter.md).[`morphoVaultV1`](../interfaces/IVaultV2MorphoVaultV1Adapter.md#morphovaultv1)

***

### parentVault

> `readonly` **parentVault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L18)

#### Implementation of

[`IVaultV2MorphoVaultV1Adapter`](../interfaces/IVaultV2MorphoVaultV1Adapter.md).[`parentVault`](../interfaces/IVaultV2MorphoVaultV1Adapter.md#parentvault)

#### Inherited from

[`VaultV2Adapter`](VaultV2Adapter.md).[`parentVault`](VaultV2Adapter.md#parentvault)

***

### skimRecipient

> **skimRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L20)

#### Implementation of

[`IVaultV2MorphoVaultV1Adapter`](../interfaces/IVaultV2MorphoVaultV1Adapter.md).[`skimRecipient`](../interfaces/IVaultV2MorphoVaultV1Adapter.md#skimrecipient)

#### Inherited from

[`VaultV2Adapter`](VaultV2Adapter.md).[`skimRecipient`](VaultV2Adapter.md#skimrecipient)

***

### type

> `readonly` **type**: `"VaultV2MorphoVaultV1Adapter"`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L24)

#### Implementation of

[`IVaultV2MorphoVaultV1Adapter`](../interfaces/IVaultV2MorphoVaultV1Adapter.md).[`type`](../interfaces/IVaultV2MorphoVaultV1Adapter.md#type)

#### Overrides

[`VaultV2Adapter`](VaultV2Adapter.md).[`type`](VaultV2Adapter.md#type)

## Methods

### ids()

> **ids**(): readonly \[`` `0x${string}` ``\]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:91](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L91)

Returns this adapter's allocation-cap ids.

#### Returns

readonly \[`` `0x${string}` ``\]

A readonly tuple containing the adapter-wide allocation-cap id.

#### Example

```ts
import { VaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";

const adapter = new VaultV2MorphoVaultV1Adapter({
  address: ZERO_ADDRESS,
  parentVault: ZERO_ADDRESS,
  skimRecipient: ZERO_ADDRESS,
  morphoVaultV1: ZERO_ADDRESS,
});
const [adapterCapId] = adapter.ids();
```

***

### adapterCapId()

> `static` **adapterCapId**(`address`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:36](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L36)

Returns the adapter-wide allocation-cap id.

#### Parameters

##### address

`` `0x${string}` ``

Adapter address.

#### Returns

`` `0x${string}` ``

The adapter-wide allocation-cap id.

#### Example

```ts
const id = VaultV2MorphoVaultV1Adapter.adapterCapId(adapter);
```

***

### ~~adapterId()~~

> `static` **adapterId**(`address`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:52](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L52)

Returns the adapter-wide allocation-cap id.

#### Parameters

##### address

`` `0x${string}` ``

Adapter address.

#### Returns

`` `0x${string}` ``

The adapter-wide allocation-cap id.

#### Deprecated

Use [VaultV2MorphoVaultV1Adapter.adapterCapId](#adaptercapid).
