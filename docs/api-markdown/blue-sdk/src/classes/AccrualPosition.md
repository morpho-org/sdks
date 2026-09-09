[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / AccrualPosition

# Class: AccrualPosition

Defined in: [packages/blue-sdk/src/position/Position.ts:66](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L66)

Represents a position paired with market state for derived and accrued values.

## Extends

- [`Position`](Position.md)

## Extended by

- [`PreLiquidationPosition`](PreLiquidationPosition.md)

## Implements

- [`IAccrualPosition`](../interfaces/IAccrualPosition.md)

## Constructors

### Constructor

> **new AccrualPosition**(`position`, `market`): `AccrualPosition`

Defined in: [packages/blue-sdk/src/position/Position.ts:69](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L69)

#### Parameters

##### position

[`IAccrualPosition`](../interfaces/IAccrualPosition.md)

##### market

[`IMarket`](../interfaces/IMarket.md)

#### Returns

`AccrualPosition`

#### Overrides

[`Position`](Position.md).[`constructor`](Position.md#constructor)

## Properties

### \_market

> `protected` `readonly` **\_market**: [`Market`](Market.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:67](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L67)

***

### borrowShares

> **borrowShares**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L41)

The amount of borrow shares held with this position.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`borrowShares`](../interfaces/IAccrualPosition.md#borrowshares)

#### Inherited from

[`Position`](Position.md).[`borrowShares`](Position.md#borrowshares)

***

### collateral

> **collateral**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:45](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L45)

The amount of collateral assets held with this position.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`collateral`](../interfaces/IAccrualPosition.md#collateral)

#### Inherited from

[`Position`](Position.md).[`collateral`](Position.md#collateral)

***

### marketId

> `readonly` **marketId**: [`MarketId`](../type-aliases/MarketId.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L32)

The id of the market on which this position is held.

#### Inherited from

[`Position`](Position.md).[`marketId`](Position.md#marketid)

***

### supplyShares

> **supplyShares**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L37)

The amount of supply shares held with this position.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`supplyShares`](../interfaces/IAccrualPosition.md#supplyshares)

#### Inherited from

[`Position`](Position.md).[`supplyShares`](Position.md#supplyshares)

***

### user

> `readonly` **user**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/position/Position.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L27)

The user holding this position.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`user`](../interfaces/IAccrualPosition.md#user)

#### Inherited from

[`Position`](Position.md).[`user`](Position.md#user)

## Accessors

### borrowAssets

#### Get Signature

> **get** **borrowAssets**(): `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:87](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L87)

##### Returns

`bigint`

***

### borrowCapacityUsage

#### Get Signature

> **get** **borrowCapacityUsage**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:193](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L193)

The percentage of this position's borrow power currently used (scaled by WAD).
If the collateral price is 0, usage is `MaxUint256`.

##### Returns

`bigint` \| `undefined`

***

### collateralValue

#### Get Signature

> **get** **collateralValue**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:95](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L95)

The value of this position's collateral quoted in loan assets.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `undefined`

***

### healthFactor

#### Get Signature

> **get** **healthFactor**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:185](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L185)

This position's health factor (collateral power over debt, scaled by WAD).
If the debt is 0, health factor is `MaxUint256`.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `undefined`

***

### isHealthy

#### Get Signature

> **get** **isHealthy**(): `boolean` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:138](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L138)

Whether this position is healthy.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`boolean` \| `undefined`

***

### isLiquidatable

#### Get Signature

> **get** **isLiquidatable**(): `boolean` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:146](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L146)

Whether this position can be liquidated.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`boolean` \| `undefined`

***

### liquidationPrice

#### Get Signature

> **get** **liquidationPrice**(): `bigint` \| `null`

Defined in: [packages/blue-sdk/src/position/Position.ts:157](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L157)

The price of the collateral quoted in loan assets that would allow this position to be liquidated.
`null` if the position has no borrow.

##### Returns

`bigint` \| `null`

***

### ltv

#### Get Signature

> **get** **ltv**(): `bigint` \| `null` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:176](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L176)

This position's Loan-To-Value (debt over collateral power, scaled by WAD).
If the collateral price is 0, LTV is `MaxUint256`.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `null` \| `undefined`

***

### market

#### Get Signature

> **get** **market**(): [`Market`](Market.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:79](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L79)

The market on which this position is held.

##### Returns

[`Market`](Market.md)

***

### maxBorrowableAssets

#### Get Signature

> **get** **maxBorrowableAssets**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:111](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L111)

The maximum additional amount of assets that can be borrowed against this position's collateral.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `undefined`

***

### maxBorrowAssets

#### Get Signature

> **get** **maxBorrowAssets**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:103](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L103)

The maximum amount of loan assets that can be borrowed against this position's collateral.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `undefined`

***

### priceVariationToLiquidationPrice

#### Get Signature

> **get** **priceVariationToLiquidationPrice**(): `bigint` \| `null` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:167](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L167)

The price variation required for the position to reach its liquidation threshold (scaled by WAD).
Negative when healthy (the price needs to drop x%), positive when unhealthy (the price needs to soar x%).
`undefined` if the market's oracle is undefined or reverts.
`null` if the position is not a borrow.

##### Returns

`bigint` \| `null` \| `undefined`

***

### seizableCollateral

#### Get Signature

> **get** **seizableCollateral**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:122](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L122)

The maximum amount of collateral that can be seized in exchange for the outstanding debt.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `undefined`

***

### supplyAssets

#### Get Signature

> **get** **supplyAssets**(): `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:83](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L83)

##### Returns

`bigint`

***

### withdrawableCollateral

#### Get Signature

> **get** **withdrawableCollateral**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:130](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L130)

The maximum amount of collateral that can be withdrawn.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `undefined`

***

### withdrawCapacityLimit

#### Get Signature

> **get** **withdrawCapacityLimit**(): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:201](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L201)

Returns the maximum amount of loan assets that can be withdrawn given a certain supply position
and a balance of loan assets, and the reason for the limit.

##### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

## Methods

### accrueInterest()

> **accrueInterest**(`timestamp?`): `AccrualPosition`

Defined in: [packages/blue-sdk/src/position/Position.ts:209](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L209)

Returns a new position derived from this position, whose interest has been accrued up to the given timestamp.

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

The timestamp at which to accrue interest. Must be greater than or equal to the market's `lastUpdate`.

#### Returns

`AccrualPosition`

***

### borrow()

> **borrow**(`assets`, `shares`, `timestamp?`): `object`

Defined in: [packages/blue-sdk/src/position/Position.ts:275](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L275)

#### Parameters

##### assets

`bigint`

##### shares

`bigint`

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

`object`

##### assets

> **assets**: `bigint`

##### position

> **position**: `AccrualPosition`

##### shares

> **shares**: `bigint`

***

### getBorrowCapacityLimit()

> **getBorrowCapacityLimit**(`options?`): [`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:312](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L312)

#### Parameters

##### options?

[`MaxBorrowOptions`](../interfaces/MaxBorrowOptions.md)

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

***

### getMaxCapacities()

> **getMaxCapacities**(`loanTokenBalance`, `collateralTokenBalance`, `options?`): [`MaxPositionCapacities`](../interfaces/MaxPositionCapacities.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:330](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L330)

#### Parameters

##### loanTokenBalance

`bigint`

##### collateralTokenBalance

`bigint`

##### options?

###### borrow?

[`MaxBorrowOptions`](../interfaces/MaxBorrowOptions.md)

###### withdrawCollateral?

[`MaxWithdrawCollateralOptions`](../interfaces/MaxWithdrawCollateralOptions.md)

#### Returns

[`MaxPositionCapacities`](../interfaces/MaxPositionCapacities.md)

***

### getRepayCapacityLimit()

> **getRepayCapacityLimit**(`loanTokenBalance`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:322](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L322)

#### Parameters

##### loanTokenBalance

`bigint`

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

***

### getWithdrawCollateralCapacityLimit()

> **getWithdrawCollateralCapacityLimit**(`options?`): [`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:316](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L316)

#### Parameters

##### options?

[`MaxWithdrawCollateralOptions`](../interfaces/MaxWithdrawCollateralOptions.md)

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

***

### repay()

> **repay**(`assets`, `shares`, `timestamp?`): `object`

Defined in: [packages/blue-sdk/src/position/Position.ts:294](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L294)

#### Parameters

##### assets

`bigint`

##### shares

`bigint`

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

`object`

##### assets

> **assets**: `bigint`

##### position

> **position**: `AccrualPosition`

##### shares

> **shares**: `bigint`

***

### supply()

> **supply**(`assets`, `shares`, `timestamp?`): `object`

Defined in: [packages/blue-sdk/src/position/Position.ts:214](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L214)

#### Parameters

##### assets

`bigint`

##### shares

`bigint`

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

`object`

##### assets

> **assets**: `bigint`

##### position

> **position**: `AccrualPosition`

##### shares

> **shares**: `bigint`

***

### supplyCollateral()

> **supplyCollateral**(`assets`): `AccrualPosition`

Defined in: [packages/blue-sdk/src/position/Position.ts:245](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L245)

#### Parameters

##### assets

`bigint`

#### Returns

`AccrualPosition`

***

### withdraw()

> **withdraw**(`assets`, `shares`, `timestamp?`): `object`

Defined in: [packages/blue-sdk/src/position/Position.ts:227](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L227)

#### Parameters

##### assets

`bigint`

##### shares

`bigint`

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

`object`

##### assets

> **assets**: `bigint`

##### position

> **position**: `AccrualPosition`

##### shares

> **shares**: `bigint`

***

### withdrawCollateral()

> **withdrawCollateral**(`assets`, `timestamp?`): `AccrualPosition`

Defined in: [packages/blue-sdk/src/position/Position.ts:251](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L251)

#### Parameters

##### assets

`bigint`

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

`AccrualPosition`
