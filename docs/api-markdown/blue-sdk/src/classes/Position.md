[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / Position

# Class: Position

Defined in: [packages/blue-sdk/src/position/Position.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L23)

Represents a user's supply, borrow, and collateral balances on one market.

## Extended by

- [`AccrualPosition`](AccrualPosition.md)

## Implements

- [`IPosition`](../interfaces/IPosition.md)

## Constructors

### Constructor

> **new Position**(`__namedParameters`): `Position`

Defined in: [packages/blue-sdk/src/position/Position.ts:47](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L47)

#### Parameters

##### \_\_namedParameters

[`IPosition`](../interfaces/IPosition.md)

#### Returns

`Position`

## Properties

### borrowShares

> **borrowShares**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L41)

The amount of borrow shares held with this position.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`borrowShares`](../interfaces/IPosition.md#borrowshares)

***

### collateral

> **collateral**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:45](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L45)

The amount of collateral assets held with this position.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`collateral`](../interfaces/IPosition.md#collateral)

***

### marketId

> `readonly` **marketId**: [`MarketId`](../type-aliases/MarketId.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L32)

The id of the market on which this position is held.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`marketId`](../interfaces/IPosition.md#marketid)

***

### supplyShares

> **supplyShares**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L37)

The amount of supply shares held with this position.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`supplyShares`](../interfaces/IPosition.md#supplyshares)

***

### user

> `readonly` **user**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/position/Position.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L27)

The user holding this position.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`user`](../interfaces/IPosition.md#user)
