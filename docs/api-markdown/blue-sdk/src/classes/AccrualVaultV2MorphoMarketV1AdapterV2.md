[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / AccrualVaultV2MorphoMarketV1AdapterV2

# Class: AccrualVaultV2MorphoMarketV1AdapterV2

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:196](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L196)

Represents an accrued Vault V2 Morpho Blue market-id adapter.

## Extends

- [`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md)

## Implements

- [`IAccrualVaultV2MorphoMarketV1AdapterV2`](../interfaces/IAccrualVaultV2MorphoMarketV1AdapterV2.md)
- [`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md)

## Constructors

### Constructor

> **new AccrualVaultV2MorphoMarketV1AdapterV2**(`adapter`, `markets`): `AccrualVaultV2MorphoMarketV1AdapterV2`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:200](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L200)

#### Parameters

##### adapter

[`IAccrualVaultV2MorphoMarketV1AdapterV2`](../interfaces/IAccrualVaultV2MorphoMarketV1AdapterV2.md)

##### markets

[`Market`](Market.md)[]

#### Returns

`AccrualVaultV2MorphoMarketV1AdapterV2`

#### Overrides

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`constructor`](VaultV2MorphoMarketV1AdapterV2.md#constructor)

## Properties

### adapterId

> `readonly` **adapterId**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L19)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`adapterId`](../interfaces/IAccrualVaultV2Adapter.md#adapterid)

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`adapterId`](VaultV2MorphoMarketV1AdapterV2.md#adapterid)

***

### adaptiveCurveIrm

> **adaptiveCurveIrm**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:127](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L127)

#### Implementation of

[`IAccrualVaultV2MorphoMarketV1AdapterV2`](../interfaces/IAccrualVaultV2MorphoMarketV1AdapterV2.md).[`adaptiveCurveIrm`](../interfaces/IAccrualVaultV2MorphoMarketV1AdapterV2.md#adaptivecurveirm)

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`adaptiveCurveIrm`](VaultV2MorphoMarketV1AdapterV2.md#adaptivecurveirm)

***

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L17)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`address`](../interfaces/IAccrualVaultV2Adapter.md#address)

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`address`](VaultV2MorphoMarketV1AdapterV2.md#address)

***

### marketIds

> **marketIds**: [`MarketId`](../type-aliases/MarketId.md)[]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:126](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L126)

#### Implementation of

[`IAccrualVaultV2MorphoMarketV1AdapterV2`](../interfaces/IAccrualVaultV2MorphoMarketV1AdapterV2.md).[`marketIds`](../interfaces/IAccrualVaultV2MorphoMarketV1AdapterV2.md#marketids)

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`marketIds`](VaultV2MorphoMarketV1AdapterV2.md#marketids)

***

### markets

> **markets**: [`Market`](Market.md)[]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:202](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L202)

***

### parentVault

> `readonly` **parentVault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L18)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`parentVault`](../interfaces/IAccrualVaultV2Adapter.md#parentvault)

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`parentVault`](VaultV2MorphoMarketV1AdapterV2.md#parentvault)

***

### skimRecipient

> **skimRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L20)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`skimRecipient`](../interfaces/IAccrualVaultV2Adapter.md#skimrecipient)

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`skimRecipient`](VaultV2MorphoMarketV1AdapterV2.md#skimrecipient)

***

### supplyShares

> **supplyShares**: `Record`\<[`MarketId`](../type-aliases/MarketId.md), `bigint`\>

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:128](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L128)

#### Implementation of

[`IAccrualVaultV2MorphoMarketV1AdapterV2`](../interfaces/IAccrualVaultV2MorphoMarketV1AdapterV2.md).[`supplyShares`](../interfaces/IAccrualVaultV2MorphoMarketV1AdapterV2.md#supplyshares)

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`supplyShares`](VaultV2MorphoMarketV1AdapterV2.md#supplyshares)

***

### type

> `readonly` **type**: `"VaultV2MorphoMarketV1AdapterV2"`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L29)

#### Implementation of

[`IAccrualVaultV2Adapter`](../interfaces/IAccrualVaultV2Adapter.md).[`type`](../interfaces/IAccrualVaultV2Adapter.md#type)

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`type`](VaultV2MorphoMarketV1AdapterV2.md#type)

## Methods

### ids()

> **ids**(`params`): readonly \[`` `0x${string}` ``, `` `0x${string}` ``, `` `0x${string}` ``\]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:176](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L176)

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
  VaultV2MorphoMarketV1AdapterV2,
} from "@morpho-org/blue-sdk";
import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";

const marketParams = MarketParams.idle(ZERO_ADDRESS);
const adapter = new VaultV2MorphoMarketV1AdapterV2({
  address: ZERO_ADDRESS,
  parentVault: ZERO_ADDRESS,
  skimRecipient: ZERO_ADDRESS,
  marketIds: [],
  adaptiveCurveIrm: ZERO_ADDRESS,
  supplyShares: {},
});
const [adapterCapId, collateralCapId, adapterMarketCapId] =
  adapter.ids(marketParams);
```

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`ids`](VaultV2MorphoMarketV1AdapterV2.md#ids)

***

### maxDeposit()

> **maxDeposit**(`_data`, `assets`): `object`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:218](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L218)

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

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:225](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L225)

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

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:207](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L207)

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

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L41)

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
const id = VaultV2MorphoMarketV1AdapterV2.adapterCapId(adapter);
```

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`adapterCapId`](VaultV2MorphoMarketV1AdapterV2.md#adaptercapid)

***

### ~~adapterId()~~

> `static` **adapterId**(`address`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L57)

Returns the adapter-wide allocation-cap id.

#### Parameters

##### address

`` `0x${string}` ``

Adapter address.

#### Returns

`` `0x${string}` ``

The adapter-wide allocation-cap id.

#### Deprecated

Use [VaultV2MorphoMarketV1AdapterV2.adapterCapId](VaultV2MorphoMarketV1AdapterV2.md#adaptercapid).

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`adapterId`](VaultV2MorphoMarketV1AdapterV2.md#adapterid-1)

***

### adapterMarketCapId()

> `static` **adapterMarketCapId**(`address`, `params`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:105](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L105)

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
const id = VaultV2MorphoMarketV1AdapterV2.adapterMarketCapId(
  adapter,
  marketParams,
);
```

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`adapterMarketCapId`](VaultV2MorphoMarketV1AdapterV2.md#adaptermarketcapid)

***

### collateralCapId()

> `static` **collateralCapId**(`address`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:71](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L71)

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
const id = VaultV2MorphoMarketV1AdapterV2.collateralCapId(collateral);
```

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`collateralCapId`](VaultV2MorphoMarketV1AdapterV2.md#collateralcapid)

***

### ~~collateralId()~~

> `static` **collateralId**(`address`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:87](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L87)

Returns the collateral-wide allocation-cap id.

#### Parameters

##### address

`` `0x${string}` ``

Collateral token address.

#### Returns

`` `0x${string}` ``

The collateral-wide allocation-cap id.

#### Deprecated

Use [VaultV2MorphoMarketV1AdapterV2.collateralCapId](VaultV2MorphoMarketV1AdapterV2.md#collateralcapid).

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`collateralId`](VaultV2MorphoMarketV1AdapterV2.md#collateralid)

***

### ~~marketParamsId()~~

> `static` **marketParamsId**(`address`, `params`): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:122](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L122)

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

Use [VaultV2MorphoMarketV1AdapterV2.adapterMarketCapId](VaultV2MorphoMarketV1AdapterV2.md#adaptermarketcapid).

#### Inherited from

[`VaultV2MorphoMarketV1AdapterV2`](VaultV2MorphoMarketV1AdapterV2.md).[`marketParamsId`](VaultV2MorphoMarketV1AdapterV2.md#marketparamsid)
