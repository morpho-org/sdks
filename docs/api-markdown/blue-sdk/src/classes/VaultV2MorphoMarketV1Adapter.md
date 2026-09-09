[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultV2MorphoMarketV1Adapter

# Class: VaultV2MorphoMarketV1Adapter

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L24)

Represents a Vault V2 adapter investing in Morpho Blue markets.

## Extends

- [`VaultV2Adapter`](VaultV2Adapter.md)

## Extended by

- [`AccrualVaultV2MorphoMarketV1Adapter`](AccrualVaultV2MorphoMarketV1Adapter.md)

## Implements

- [`IVaultV2MorphoMarketV1Adapter`](../interfaces/IVaultV2MorphoMarketV1Adapter.md)

## Constructors

### Constructor

> **new VaultV2MorphoMarketV1Adapter**(`__namedParameters`): `VaultV2MorphoMarketV1Adapter`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:127](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L127)

#### Parameters

##### \_\_namedParameters

[`IVaultV2MorphoMarketV1Adapter`](../interfaces/IVaultV2MorphoMarketV1Adapter.md)

#### Returns

`VaultV2MorphoMarketV1Adapter`

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

[`IVaultV2MorphoMarketV1Adapter`](../interfaces/IVaultV2MorphoMarketV1Adapter.md).[`address`](../interfaces/IVaultV2MorphoMarketV1Adapter.md#address)

#### Inherited from

[`VaultV2Adapter`](VaultV2Adapter.md).[`address`](VaultV2Adapter.md#address)

***

### marketParamsList

> **marketParamsList**: [`MarketParams`](MarketParams.md)[]

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:125](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L125)

#### Implementation of

[`IVaultV2MorphoMarketV1Adapter`](../interfaces/IVaultV2MorphoMarketV1Adapter.md).[`marketParamsList`](../interfaces/IVaultV2MorphoMarketV1Adapter.md#marketparamslist)

***

### parentVault

> `readonly` **parentVault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L18)

#### Implementation of

[`IVaultV2MorphoMarketV1Adapter`](../interfaces/IVaultV2MorphoMarketV1Adapter.md).[`parentVault`](../interfaces/IVaultV2MorphoMarketV1Adapter.md#parentvault)

#### Inherited from

[`VaultV2Adapter`](VaultV2Adapter.md).[`parentVault`](VaultV2Adapter.md#parentvault)

***

### skimRecipient

> **skimRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L20)

#### Implementation of

[`IVaultV2MorphoMarketV1Adapter`](../interfaces/IVaultV2MorphoMarketV1Adapter.md).[`skimRecipient`](../interfaces/IVaultV2MorphoMarketV1Adapter.md#skimrecipient)

#### Inherited from

[`VaultV2Adapter`](VaultV2Adapter.md).[`skimRecipient`](VaultV2Adapter.md#skimrecipient)

***

### type

> `readonly` **type**: `"VaultV2MorphoMarketV1Adapter"`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2MorphoMarketV1Adapter.ts#L28)

#### Implementation of

[`IVaultV2MorphoMarketV1Adapter`](../interfaces/IVaultV2MorphoMarketV1Adapter.md).[`type`](../interfaces/IVaultV2MorphoMarketV1Adapter.md#type)

#### Overrides

[`VaultV2Adapter`](VaultV2Adapter.md).[`type`](VaultV2Adapter.md#type)

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

Use [VaultV2MorphoMarketV1Adapter.adapterCapId](#adaptercapid).

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

Use [VaultV2MorphoMarketV1Adapter.collateralCapId](#collateralcapid).

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

Use [VaultV2MorphoMarketV1Adapter.adapterMarketCapId](#adaptermarketcapid).
