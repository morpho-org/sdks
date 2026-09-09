[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / MarketParams

# Class: MarketParams

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L32)

Represents a market's configuration (also called market params).

## Implements

- [`IMarketParams`](../interfaces/IMarketParams.md)

## Constructors

### Constructor

> **new MarketParams**(`params`): `MarketParams`

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:105](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L105)

#### Parameters

##### params

[`IMarketParams`](../interfaces/IMarketParams.md)

#### Returns

`MarketParams`

## Properties

### collateralToken

> `readonly` **collateralToken**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:73](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L73)

The market's collateral token address.

#### Implementation of

[`IMarketParams`](../interfaces/IMarketParams.md).[`collateralToken`](../interfaces/IMarketParams.md#collateraltoken)

***

### id

> `readonly` **id**: [`MarketId`](../type-aliases/MarketId.md)

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:98](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L98)

The market's hex-encoded id, defined as the hash of the market params.

***

### irm

> `readonly` **irm**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:88](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L88)

The market's interest rate model address.

#### Implementation of

[`IMarketParams`](../interfaces/IMarketParams.md).[`irm`](../interfaces/IMarketParams.md#irm)

***

### liquidationIncentiveFactor

> `readonly` **liquidationIncentiveFactor**: `bigint`

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:103](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L103)

The market's liquidation incentive factor.

***

### lltv

> `readonly` **lltv**: `bigint`

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:93](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L93)

The market's liquidation Loan-To-Value (scaled by WAD).

#### Implementation of

[`IMarketParams`](../interfaces/IMarketParams.md).[`lltv`](../interfaces/IMarketParams.md#lltv)

***

### loanToken

> `readonly` **loanToken**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:78](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L78)

The market's loan token address.

#### Implementation of

[`IMarketParams`](../interfaces/IMarketParams.md).[`loanToken`](../interfaces/IMarketParams.md#loantoken)

***

### oracle

> `readonly` **oracle**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:83](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L83)

The market's oracle address.

#### Implementation of

[`IMarketParams`](../interfaces/IMarketParams.md).[`oracle`](../interfaces/IMarketParams.md#oracle)

## Methods

### fromHex()

> `static` **fromHex**(`data`): `MarketParams`

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:60](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L60)

#### Parameters

##### data

`` `0x${string}` ``

#### Returns

`MarketParams`

***

### get()

> `static` **get**(`id`): `MarketParams`

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L39)

Returns the previously cached market config for the given id, if any.

#### Parameters

##### id

[`MarketId`](../type-aliases/MarketId.md)

#### Returns

`MarketParams`

#### Throws

If no market config is cached.

***

### idle()

> `static` **idle**(`token`): `MarketParams`

Defined in: [packages/blue-sdk/src/market/MarketParams.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketParams.ts#L50)

Returns the canonical idle market configuration for the given loan token.

#### Parameters

##### token

`` `0x${string}` ``

#### Returns

`MarketParams`
