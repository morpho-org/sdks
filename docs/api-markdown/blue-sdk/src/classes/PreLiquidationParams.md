[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / PreLiquidationParams

# Class: PreLiquidationParams

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L19)

Represents PreLiquidation contract parameters and factor interpolation helpers.

## Implements

- [`IPreLiquidationParams`](../interfaces/IPreLiquidationParams.md)

## Constructors

### Constructor

> **new PreLiquidationParams**(`__namedParameters`): `PreLiquidationParams`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L27)

#### Parameters

##### \_\_namedParameters

[`IPreLiquidationParams`](../interfaces/IPreLiquidationParams.md)

#### Returns

`PreLiquidationParams`

## Properties

### preLCF1

> `readonly` **preLCF1**: `bigint`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L21)

#### Implementation of

[`IPreLiquidationParams`](../interfaces/IPreLiquidationParams.md).[`preLCF1`](../interfaces/IPreLiquidationParams.md#prelcf1)

***

### preLCF2

> `readonly` **preLCF2**: `bigint`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L22)

#### Implementation of

[`IPreLiquidationParams`](../interfaces/IPreLiquidationParams.md).[`preLCF2`](../interfaces/IPreLiquidationParams.md#prelcf2)

***

### preLIF1

> `readonly` **preLIF1**: `bigint`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L23)

#### Implementation of

[`IPreLiquidationParams`](../interfaces/IPreLiquidationParams.md).[`preLIF1`](../interfaces/IPreLiquidationParams.md#prelif1)

***

### preLIF2

> `readonly` **preLIF2**: `bigint`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L24)

#### Implementation of

[`IPreLiquidationParams`](../interfaces/IPreLiquidationParams.md).[`preLIF2`](../interfaces/IPreLiquidationParams.md#prelif2)

***

### preLiquidationOracle

> `readonly` **preLiquidationOracle**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L25)

#### Implementation of

[`IPreLiquidationParams`](../interfaces/IPreLiquidationParams.md).[`preLiquidationOracle`](../interfaces/IPreLiquidationParams.md#preliquidationoracle)

***

### preLltv

> `readonly` **preLltv**: `bigint`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L20)

#### Implementation of

[`IPreLiquidationParams`](../interfaces/IPreLiquidationParams.md).[`preLltv`](../interfaces/IPreLiquidationParams.md#prelltv)

## Methods

### getCloseFactor()

> **getCloseFactor**(`quotient`): `bigint`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L43)

#### Parameters

##### quotient

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

`bigint`

***

### getIncentiveFactor()

> **getIncentiveFactor**(`quotient`): `bigint`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L49)

#### Parameters

##### quotient

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

`bigint`
