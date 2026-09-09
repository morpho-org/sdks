[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultV2MorphoMarketV1AdapterV2

# Class: VaultV2MorphoMarketV1AdapterV2

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L25)

Represents a Vault V2 Morpho Blue market adapter using market ids.

## Extends

- [`VaultV2Adapter`](VaultV2Adapter.md)

## Extended by

- [`AccrualVaultV2MorphoMarketV1AdapterV2`](AccrualVaultV2MorphoMarketV1AdapterV2.md)

## Implements

- [`IVaultV2MorphoMarketV1AdapterV2`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md)

## Constructors

### Constructor

> **new VaultV2MorphoMarketV1AdapterV2**(`__namedParameters`): `VaultV2MorphoMarketV1AdapterV2`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:130](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L130)

#### Parameters

##### \_\_namedParameters

[`IVaultV2MorphoMarketV1AdapterV2`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md)

#### Returns

`VaultV2MorphoMarketV1AdapterV2`

#### Overrides

[`VaultV2Adapter`](VaultV2Adapter.md).[`constructor`](VaultV2Adapter.md#constructor)

## Properties

### adapterId

> `readonly` **adapterId**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L19)

#### Inherited from

[`VaultV2Adapter`](VaultV2Adapter.md).[`adapterId`](VaultV2Adapter.md#adapterid)

***

### adaptiveCurveIrm

> **adaptiveCurveIrm**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:127](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L127)

#### Implementation of

[`IVaultV2MorphoMarketV1AdapterV2`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md).[`adaptiveCurveIrm`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md#adaptivecurveirm)

***

### address

> `readonly` **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L17)

#### Implementation of

[`IVaultV2MorphoMarketV1AdapterV2`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md).[`address`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md#address)

#### Inherited from

[`VaultV2Adapter`](VaultV2Adapter.md).[`address`](VaultV2Adapter.md#address)

***

### marketIds

> **marketIds**: [`MarketId`](../type-aliases/MarketId.md)[]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:126](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L126)

#### Implementation of

[`IVaultV2MorphoMarketV1AdapterV2`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md).[`marketIds`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md#marketids)

***

### parentVault

> `readonly` **parentVault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L18)

#### Implementation of

[`IVaultV2MorphoMarketV1AdapterV2`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md).[`parentVault`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md#parentvault)

#### Inherited from

[`VaultV2Adapter`](VaultV2Adapter.md).[`parentVault`](VaultV2Adapter.md#parentvault)

***

### skimRecipient

> **skimRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L20)

#### Implementation of

[`IVaultV2MorphoMarketV1AdapterV2`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md).[`skimRecipient`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md#skimrecipient)

#### Inherited from

[`VaultV2Adapter`](VaultV2Adapter.md).[`skimRecipient`](VaultV2Adapter.md#skimrecipient)

***

### supplyShares

> **supplyShares**: `Record`\<[`MarketId`](../type-aliases/MarketId.md), `bigint`\>

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:128](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L128)

#### Implementation of

[`IVaultV2MorphoMarketV1AdapterV2`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md).[`supplyShares`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md#supplyshares)

***

### type

> `readonly` **type**: `"VaultV2MorphoMarketV1AdapterV2"`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1AdapterV2.ts#L29)

#### Implementation of

[`IVaultV2MorphoMarketV1AdapterV2`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md).[`type`](../interfaces/IVaultV2MorphoMarketV1AdapterV2.md#type)

#### Overrides

[`VaultV2Adapter`](VaultV2Adapter.md).[`type`](VaultV2Adapter.md#type)

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

Use [VaultV2MorphoMarketV1AdapterV2.adapterCapId](#adaptercapid).

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

Use [VaultV2MorphoMarketV1AdapterV2.collateralCapId](#collateralcapid).

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

Use [VaultV2MorphoMarketV1AdapterV2.adapterMarketCapId](#adaptermarketcapid).
