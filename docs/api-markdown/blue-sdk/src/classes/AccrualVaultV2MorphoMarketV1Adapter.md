[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / AccrualVaultV2MorphoMarketV1Adapter

# Class: AccrualVaultV2MorphoMarketV1Adapter

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:189](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L189)

Represents an accrued Morpho Blue market Vault V2 adapter.

## Extends

- [`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md)

## Implements

- [`IAccrualVaultV2MorphoMarketV1Adapter`](../interfaces/IAccrualVaultV2MorphoMarketV1Adapter.md)
- [`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md)

## Constructors

### Constructor

> **new AccrualVaultV2MorphoMarketV1Adapter**(`adapter`, `positions`): `AccrualVaultV2MorphoMarketV1Adapter`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:193](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L193)

#### Parameters

##### adapter

[`IAccrualVaultV2MorphoMarketV1Adapter`](../interfaces/IAccrualVaultV2MorphoMarketV1Adapter.md)

##### positions

[`AccrualPosition`](AccrualPosition.md)[]

#### Returns

`AccrualVaultV2MorphoMarketV1Adapter`

#### Overrides

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`constructor`](VaultV2MorphoMarketV1Adapter.md#constructor)

## Properties

### adapterId

> `readonly` **adapterId**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L19)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`adapterId`](../interfaces/IAccrualVaultV2Adapter.md#adapterid)

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`adapterId`](VaultV2MorphoMarketV1Adapter.md#adapterid)

***

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L17)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`address`](../interfaces/IAccrualVaultV2Adapter.md#address)

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`address`](VaultV2MorphoMarketV1Adapter.md#address)

***

### marketParamsList

> **marketParamsList**: [`MarketParams`](MarketParams.md)[]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:125](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L125)

#### Implementation of

[`IAccrualVaultV2MorphoMarketV1Adapter`](../interfaces/IAccrualVaultV2MorphoMarketV1Adapter.md).[`marketParamsList`](../interfaces/IAccrualVaultV2MorphoMarketV1Adapter.md#marketparamslist)

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`marketParamsList`](VaultV2MorphoMarketV1Adapter.md#marketparamslist)

***

### parentVault

> `readonly` **parentVault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L18)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`parentVault`](../interfaces/IAccrualVaultV2Adapter.md#parentvault)

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`parentVault`](VaultV2MorphoMarketV1Adapter.md#parentvault)

***

### positions

> **positions**: [`AccrualPosition`](AccrualPosition.md)[]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:195](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L195)

***

### skimRecipient

> **skimRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L20)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`skimRecipient`](../interfaces/IAccrualVaultV2Adapter.md#skimrecipient)

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`skimRecipient`](VaultV2MorphoMarketV1Adapter.md#skimrecipient)

***

### type

> `readonly` **type**: `"VaultV2MorphoMarketV1Adapter"`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L28)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`type`](../interfaces/IAccrualVaultV2Adapter.md#type)

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`type`](VaultV2MorphoMarketV1Adapter.md#type)

## Methods

### ids()

> **ids**(`params`): readonly \[`` `0x${string}` ``, `` `0x${string}` ``, `` `0x${string}` ``\]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:169](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L169)

Returns this adapter's allocation-cap ids for a Morpho Blue market.

#### Parameters

##### params

[`MarketParams`](MarketParams.md)

Morpho Blue market parameters.

#### Returns

readonly \[`` `0x${string}` ``, `` `0x${string}` ``, `` `0x${string}` ``\]

A readonly tuple containing the adapter, collateral, and adapter-market
  allocation-cap ids, in that order.

#### Example

```ts
import {
  MarketParams,
  VaultV2MorphoMarketV1Adapter,
} from "@morpho-org/blue-sdk";
import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";

const marketParams = MarketParams.idle(ZERO_ADDRESS);
const adapter = new VaultV2MorphoMarketV1Adapter({
  address: ZERO_ADDRESS,
  parentVault: ZERO_ADDRESS,
  skimRecipient: ZERO_ADDRESS,
  marketParamsList: [marketParams],
});
const [adapterCapId, collateralCapId, adapterMarketCapId] =
  adapter.ids(marketParams);
```

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`ids`](VaultV2MorphoMarketV1Adapter.md#ids)

***

### maxDeposit()

> **maxDeposit**(`_data`, `assets`): `object`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:208](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L208)

Returns the maximum amount of assets that can be deposited to this adapter.

#### Parameters

##### \_data

`` `0x${string}` ``

##### assets

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

The maximum amount of assets to deposit.

#### Returns

`object`

##### limiter

> **limiter**: [`CapacityLimitReason`](../enumerations/CapacityLimitReason.md) = `CapacityLimitReason.balance`

##### value

> **value**: `bigint`

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`maxDeposit`](../interfaces/IAccrualVaultV2Adapter.md#maxdeposit)

***

### maxWithdraw()

> **maxWithdraw**(`data`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:215](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L215)

Returns the maximum amount of assets that can be withdrawn from this adapter.

#### Parameters

##### data

`` `0x${string}` ``

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`maxWithdraw`](../interfaces/IAccrualVaultV2Adapter.md#maxwithdraw)

***

### realAssets()

> **realAssets**(`timestamp?`): `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:200](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L200)

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

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:40](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L40)

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
const id = VaultV2MorphoMarketV1Adapter.adapterCapId(adapter);
```

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`adapterCapId`](VaultV2MorphoMarketV1Adapter.md#adaptercapid)

***

### ~~adapterId()~~

> `static` **adapterId**(`address`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:56](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L56)

Returns the adapter-wide allocation-cap id.

#### Parameters

##### address

`` `0x${string}` ``

Adapter address.

#### Returns

`` `0x${string}` ``

The adapter-wide allocation-cap id.

#### Deprecated

Use [VaultV2MorphoMarketV1Adapter.adapterCapId](VaultV2MorphoMarketV1Adapter.md#adaptercapid).

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`adapterId`](VaultV2MorphoMarketV1Adapter.md#adapterid-1)

***

### adapterMarketCapId()

> `static` **adapterMarketCapId**(`address`, `params`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:104](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L104)

Returns the adapter-market allocation-cap id.

#### Parameters

##### address

`` `0x${string}` ``

Adapter address.

##### params

[`MarketParams`](MarketParams.md)

Morpho Blue market parameters.

#### Returns

`` `0x${string}` ``

The adapter-market allocation-cap id.

#### Example

```ts
const id = VaultV2MorphoMarketV1Adapter.adapterMarketCapId(
  adapter,
  marketParams,
);
```

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`adapterMarketCapId`](VaultV2MorphoMarketV1Adapter.md#adaptermarketcapid)

***

### collateralCapId()

> `static` **collateralCapId**(`address`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:70](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L70)

Returns the collateral-wide allocation-cap id.

#### Parameters

##### address

`` `0x${string}` ``

Collateral token address.

#### Returns

`` `0x${string}` ``

The collateral-wide allocation-cap id.

#### Example

```ts
const id = VaultV2MorphoMarketV1Adapter.collateralCapId(collateral);
```

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`collateralCapId`](VaultV2MorphoMarketV1Adapter.md#collateralcapid)

***

### ~~collateralId()~~

> `static` **collateralId**(`address`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:86](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L86)

Returns the collateral-wide allocation-cap id.

#### Parameters

##### address

`` `0x${string}` ``

Collateral token address.

#### Returns

`` `0x${string}` ``

The collateral-wide allocation-cap id.

#### Deprecated

Use [VaultV2MorphoMarketV1Adapter.collateralCapId](VaultV2MorphoMarketV1Adapter.md#collateralcapid).

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`collateralId`](VaultV2MorphoMarketV1Adapter.md#collateralid)

***

### ~~marketParamsId()~~

> `static` **marketParamsId**(`address`, `params`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:121](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L121)

Returns the adapter-market allocation-cap id.

#### Parameters

##### address

`` `0x${string}` ``

Adapter address.

##### params

[`MarketParams`](MarketParams.md)

Morpho Blue market parameters.

#### Returns

`` `0x${string}` ``

The adapter-market allocation-cap id.

#### Deprecated

Use [VaultV2MorphoMarketV1Adapter.adapterMarketCapId](VaultV2MorphoMarketV1Adapter.md#adaptermarketcapid).

#### Inherited from

[`VaultV2MorphoMarketV1Adapter`](VaultV2MorphoMarketV1Adapter.md).[`marketParamsId`](VaultV2MorphoMarketV1Adapter.md#marketparamsid)
