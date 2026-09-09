[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IAccrualPosition

# Interface: IAccrualPosition

Defined in: [packages/blue-sdk/src/position/Position.ts:63](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L63)

Plain input shape for a position paired with market state for accrual math.

## Extends

- `Omit`\<[`IPosition`](IPosition.md), `"marketId"`\>

## Extended by

- [`IPreLiquidationPosition`](IPreLiquidationPosition.md)

## Properties

### borrowShares

> **borrowShares**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L18)

#### Inherited from

[`IPosition`](IPosition.md).[`borrowShares`](IPosition.md#borrowshares)

***

### collateral

> **collateral**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L19)

#### Inherited from

[`IPosition`](IPosition.md).[`collateral`](IPosition.md#collateral)

***

### supplyShares

> **supplyShares**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L17)

#### Inherited from

[`IPosition`](IPosition.md).[`supplyShares`](IPosition.md#supplyshares)

***

### user

> **user**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/position/Position.ts:15](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L15)

#### Inherited from

[`IPosition`](IPosition.md).[`user`](IPosition.md#user)
