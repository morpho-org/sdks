[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / AccrualVaultV2MorphoVaultV1Adapter

# Class: AccrualVaultV2MorphoVaultV1Adapter

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:101](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L101)

Represents an accrued Vault V2 MetaMorpho V1 adapter.

## Extends

- [`VaultV2MorphoVaultV1Adapter`](VaultV2MorphoVaultV1Adapter.md)

## Implements

- [`IAccrualVaultV2MorphoVaultV1Adapter`](../interfaces/IAccrualVaultV2MorphoVaultV1Adapter.md)
- [`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md)

## Constructors

### Constructor

> **new AccrualVaultV2MorphoVaultV1Adapter**(`adapter`, `accrualVaultV1`, `shares`): `AccrualVaultV2MorphoVaultV1Adapter`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:106](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L106)

#### Parameters

##### adapter

[`IAccrualVaultV2MorphoVaultV1Adapter`](../interfaces/IAccrualVaultV2MorphoVaultV1Adapter.md)

##### accrualVaultV1

[`AccrualVault`](AccrualVault.md)

##### shares

`bigint`

#### Returns

`AccrualVaultV2MorphoVaultV1Adapter`

#### Overrides

[`VaultV2MorphoVaultV1Adapter`](VaultV2MorphoVaultV1Adapter.md).[`constructor`](VaultV2MorphoVaultV1Adapter.md#constructor)

## Properties

### accrualVaultV1

> **accrualVaultV1**: [`AccrualVault`](AccrualVault.md)

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:108](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L108)

***

### adapterId

> `readonly` **adapterId**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L19)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`adapterId`](../interfaces/IAccrualVaultV2Adapter.md#adapterid)

#### Inherited from

[`VaultV2MorphoVaultV1Adapter`](VaultV2MorphoVaultV1Adapter.md).[`adapterId`](VaultV2MorphoVaultV1Adapter.md#adapterid)

***

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L17)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`address`](../interfaces/IAccrualVaultV2Adapter.md#address)

#### Inherited from

[`VaultV2MorphoVaultV1Adapter`](VaultV2MorphoVaultV1Adapter.md).[`address`](VaultV2MorphoVaultV1Adapter.md#address)

***

### morphoVaultV1

> `readonly` **morphoVaultV1**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:56](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L56)

#### Implementation of

[`IAccrualVaultV2MorphoVaultV1Adapter`](../interfaces/IAccrualVaultV2MorphoVaultV1Adapter.md).[`morphoVaultV1`](../interfaces/IAccrualVaultV2MorphoVaultV1Adapter.md#morphovaultv1)

#### Inherited from

[`VaultV2MorphoVaultV1Adapter`](VaultV2MorphoVaultV1Adapter.md).[`morphoVaultV1`](VaultV2MorphoVaultV1Adapter.md#morphovaultv1)

***

### parentVault

> `readonly` **parentVault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L18)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`parentVault`](../interfaces/IAccrualVaultV2Adapter.md#parentvault)

#### Inherited from

[`VaultV2MorphoVaultV1Adapter`](VaultV2MorphoVaultV1Adapter.md).[`parentVault`](VaultV2MorphoVaultV1Adapter.md#parentvault)

***

### shares

> **shares**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:109](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L109)

***

### skimRecipient

> **skimRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L20)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`skimRecipient`](../interfaces/IAccrualVaultV2Adapter.md#skimrecipient)

#### Inherited from

[`VaultV2MorphoVaultV1Adapter`](VaultV2MorphoVaultV1Adapter.md).[`skimRecipient`](VaultV2MorphoVaultV1Adapter.md#skimrecipient)

***

### type

> `readonly` **type**: `"VaultV2MorphoVaultV1Adapter"`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L24)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`type`](../interfaces/IAccrualVaultV2Adapter.md#type)

#### Inherited from

[`VaultV2MorphoVaultV1Adapter`](VaultV2MorphoVaultV1Adapter.md).[`type`](VaultV2MorphoVaultV1Adapter.md#type)

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

#### Inherited from

[`VaultV2MorphoVaultV1Adapter`](VaultV2MorphoVaultV1Adapter.md).[`ids`](VaultV2MorphoVaultV1Adapter.md#ids)

***

### maxDeposit()

> **maxDeposit**(`_data`, `assets`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:118](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L118)

Returns the maximum amount of assets that can be deposited to this adapter.

#### Parameters

##### \_data

`` `0x${string}` ``

##### assets

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

The maximum amount of assets to deposit.

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`maxDeposit`](../interfaces/IAccrualVaultV2Adapter.md#maxdeposit)

***

### maxWithdraw()

> **maxWithdraw**(`_data`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:122](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L122)

Returns the maximum amount of assets that can be withdrawn from this adapter.

#### Parameters

##### \_data

`` `0x${string}` ``

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`maxWithdraw`](../interfaces/IAccrualVaultV2Adapter.md#maxwithdraw)

***

### realAssets()

> **realAssets**(`timestamp?`): `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts:114](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoVaultV1Adapter.ts#L114)

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

`bigint`

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`realAssets`](../interfaces/IAccrualVaultV2Adapter.md#realassets)

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

#### Inherited from

[`VaultV2MorphoVaultV1Adapter`](VaultV2MorphoVaultV1Adapter.md).[`adapterCapId`](VaultV2MorphoVaultV1Adapter.md#adaptercapid)

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

Use [VaultV2MorphoVaultV1Adapter.adapterCapId](VaultV2MorphoVaultV1Adapter.md#adaptercapid).

#### Inherited from

[`VaultV2MorphoVaultV1Adapter`](VaultV2MorphoVaultV1Adapter.md).[`adapterId`](VaultV2MorphoVaultV1Adapter.md#adapterid-1)
