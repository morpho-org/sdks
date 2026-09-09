[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IPreLiquidationPosition

# Interface: IPreLiquidationPosition

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L57)

Plain input shape for a position associated with a PreLiquidation contract.

## Extends

- [`IAccrualPosition`](IAccrualPosition.md)

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

### preLiquidation

> **preLiquidation**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:65](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L65)

The address of the PreLiquidation contract this position is associated to.

***

### preLiquidationOraclePrice?

> `optional` **preLiquidationOraclePrice?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:70](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L70)

The price of the collateral quoted in loan assets used by the PreLiquidation contract.
`undefined` if the oracle reverts.

***

### preLiquidationParams

> **preLiquidationParams**: [`IPreLiquidationParams`](IPreLiquidationParams.md)

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:61](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L61)

The pre-liquidation parameters of the associated PreLiquidation contract.

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
