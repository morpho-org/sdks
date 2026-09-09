[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / PreLiquidationPosition

# Class: PreLiquidationPosition

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:74](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L74)

Represents a position evaluated under PreLiquidation-specific risk parameters.

## Extends

- [`AccrualPosition`](AccrualPosition.md)

## Implements

- [`IPreLiquidationPosition`](../interfaces/IPreLiquidationPosition.md)

## Constructors

### Constructor

> **new PreLiquidationPosition**(`__namedParameters`, `market`): `PreLiquidationPosition`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:84](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L84)

#### Parameters

##### \_\_namedParameters

[`IPreLiquidationPosition`](../interfaces/IPreLiquidationPosition.md)

##### market

[`IMarket`](../interfaces/IMarket.md)

#### Returns

`PreLiquidationPosition`

#### Overrides

[`AccrualPosition`](AccrualPosition.md).[`constructor`](AccrualPosition.md#constructor)

## Properties

### \_baseMarket

> `protected` `readonly` **\_baseMarket**: [`Market`](Market.md)

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:82](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L82)

***

### \_market

> `protected` `readonly` **\_market**: [`Market`](Market.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:67](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L67)

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`_market`](AccrualPosition.md#_market)

***

### borrowShares

> **borrowShares**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L41)

The amount of borrow shares held with this position.

#### Implementation of

[`IPreLiquidationPosition`](../interfaces/IPreLiquidationPosition.md).[`borrowShares`](../interfaces/IPreLiquidationPosition.md#borrowshares)

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`borrowShares`](AccrualPosition.md#borrowshares)

***

### collateral

> **collateral**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:45](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L45)

The amount of collateral assets held with this position.

#### Implementation of

[`IPreLiquidationPosition`](../interfaces/IPreLiquidationPosition.md).[`collateral`](../interfaces/IPreLiquidationPosition.md#collateral)

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`collateral`](AccrualPosition.md#collateral)

***

### marketId

> `readonly` **marketId**: [`MarketId`](../type-aliases/MarketId.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L32)

The id of the market on which this position is held.

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`marketId`](AccrualPosition.md#marketid)

***

### preLiquidation

> `readonly` **preLiquidation**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:79](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L79)

The address of the PreLiquidation contract this position is associated to.

#### Implementation of

[`IPreLiquidationPosition`](../interfaces/IPreLiquidationPosition.md).[`preLiquidation`](../interfaces/IPreLiquidationPosition.md#preliquidation)

***

### preLiquidationOraclePrice?

> `readonly` `optional` **preLiquidationOraclePrice?**: `bigint`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:80](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L80)

The price of the collateral quoted in loan assets used by the PreLiquidation contract.
`undefined` if the oracle reverts.

#### Implementation of

[`IPreLiquidationPosition`](../interfaces/IPreLiquidationPosition.md).[`preLiquidationOraclePrice`](../interfaces/IPreLiquidationPosition.md#preliquidationoracleprice)

***

### preLiquidationParams

> `readonly` **preLiquidationParams**: [`PreLiquidationParams`](PreLiquidationParams.md)

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:78](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L78)

The pre-liquidation parameters of the associated PreLiquidation contract.

#### Implementation of

[`IPreLiquidationPosition`](../interfaces/IPreLiquidationPosition.md).[`preLiquidationParams`](../interfaces/IPreLiquidationPosition.md#preliquidationparams)

***

### supplyShares

> **supplyShares**: `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L37)

The amount of supply shares held with this position.

#### Implementation of

[`IPreLiquidationPosition`](../interfaces/IPreLiquidationPosition.md).[`supplyShares`](../interfaces/IPreLiquidationPosition.md#supplyshares)

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`supplyShares`](AccrualPosition.md#supplyshares)

***

### user

> `readonly` **user**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/position/Position.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L27)

The user holding this position.

#### Implementation of

[`IPreLiquidationPosition`](../interfaces/IPreLiquidationPosition.md).[`user`](../interfaces/IPreLiquidationPosition.md#user)

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`user`](AccrualPosition.md#user)

## Accessors

### \_lltv

#### Get Signature

> **get** `protected` **\_lltv**(): `bigint`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:118](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L118)

##### Returns

`bigint`

***

### borrowAssets

#### Get Signature

> **get** **borrowAssets**(): `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:87](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L87)

##### Returns

`bigint`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`borrowAssets`](AccrualPosition.md#borrowassets)

***

### borrowCapacityUsage

#### Get Signature

> **get** **borrowCapacityUsage**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:193](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L193)

The percentage of this position's borrow power currently used (scaled by WAD).
If the collateral price is 0, usage is `MaxUint256`.

##### Returns

`bigint` \| `undefined`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`borrowCapacityUsage`](AccrualPosition.md#borrowcapacityusage)

***

### collateralValue

#### Get Signature

> **get** **collateralValue**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:95](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L95)

The value of this position's collateral quoted in loan assets.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `undefined`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`collateralValue`](AccrualPosition.md#collateralvalue)

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

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`healthFactor`](AccrualPosition.md#healthfactor)

***

### isHealthy

#### Get Signature

> **get** **isHealthy**(): `boolean` \| `undefined`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:138](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L138)

Whether this position is healthy.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`boolean` \| `undefined`

#### Overrides

[`AccrualPosition`](AccrualPosition.md).[`isHealthy`](AccrualPosition.md#ishealthy)

***

### isLiquidatable

#### Get Signature

> **get** **isLiquidatable**(): `boolean` \| `undefined`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:154](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L154)

Whether this position can be liquidated.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`boolean` \| `undefined`

#### Overrides

[`AccrualPosition`](AccrualPosition.md).[`isLiquidatable`](AccrualPosition.md#isliquidatable)

***

### liquidationPrice

#### Get Signature

> **get** **liquidationPrice**(): `bigint` \| `null`

Defined in: [packages/blue-sdk/src/position/Position.ts:157](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L157)

The price of the collateral quoted in loan assets that would allow this position to be liquidated.
`null` if the position has no borrow.

##### Returns

`bigint` \| `null`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`liquidationPrice`](AccrualPosition.md#liquidationprice)

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

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`ltv`](AccrualPosition.md#ltv)

***

### market

#### Get Signature

> **get** **market**(): [`Market`](Market.md)

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:114](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L114)

The market on which this position is held.

##### Returns

[`Market`](Market.md)

#### Overrides

[`AccrualPosition`](AccrualPosition.md).[`market`](AccrualPosition.md#market)

***

### maxBorrowableAssets

#### Get Signature

> **get** **maxBorrowableAssets**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:111](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L111)

The maximum additional amount of assets that can be borrowed against this position's collateral.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `undefined`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`maxBorrowableAssets`](AccrualPosition.md#maxborrowableassets)

***

### maxBorrowAssets

#### Get Signature

> **get** **maxBorrowAssets**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:103](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L103)

The maximum amount of loan assets that can be borrowed against this position's collateral.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `undefined`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`maxBorrowAssets`](AccrualPosition.md#maxborrowassets)

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

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`priceVariationToLiquidationPrice`](AccrualPosition.md#pricevariationtoliquidationprice)

***

### seizableCollateral

#### Get Signature

> **get** **seizableCollateral**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:170](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L170)

The maximum amount of collateral that can be seized in exchange for the outstanding debt.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `undefined`

#### Overrides

[`AccrualPosition`](AccrualPosition.md).[`seizableCollateral`](AccrualPosition.md#seizablecollateral)

***

### supplyAssets

#### Get Signature

> **get** **supplyAssets**(): `bigint`

Defined in: [packages/blue-sdk/src/position/Position.ts:83](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L83)

##### Returns

`bigint`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`supplyAssets`](AccrualPosition.md#supplyassets)

***

### withdrawableCollateral

#### Get Signature

> **get** **withdrawableCollateral**(): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:130](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L130)

The maximum amount of collateral that can be withdrawn.
`undefined` if the market's oracle is undefined or reverts.

##### Returns

`bigint` \| `undefined`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`withdrawableCollateral`](AccrualPosition.md#withdrawablecollateral)

***

### withdrawCapacityLimit

#### Get Signature

> **get** **withdrawCapacityLimit**(): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:201](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L201)

Returns the maximum amount of loan assets that can be withdrawn given a certain supply position
and a balance of loan assets, and the reason for the limit.

##### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`withdrawCapacityLimit`](AccrualPosition.md#withdrawcapacitylimit)

## Methods

### accrueInterest()

> **accrueInterest**(`timestamp?`): `PreLiquidationPosition`

Defined in: [packages/blue-sdk/src/position/PreLiquidationPosition.ts:122](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/PreLiquidationPosition.ts#L122)

Returns a new position derived from this position, whose interest has been accrued up to the given timestamp.

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

The timestamp at which to accrue interest. Must be greater than or equal to the market's `lastUpdate`.

#### Returns

`PreLiquidationPosition`

#### Overrides

[`AccrualPosition`](AccrualPosition.md).[`accrueInterest`](AccrualPosition.md#accrueinterest)

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

> **position**: [`AccrualPosition`](AccrualPosition.md)

##### shares

> **shares**: `bigint`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`borrow`](AccrualPosition.md#borrow)

***

### getBorrowCapacityLimit()

> **getBorrowCapacityLimit**(`options?`): [`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:312](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L312)

#### Parameters

##### options?

[`MaxBorrowOptions`](../interfaces/MaxBorrowOptions.md)

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`getBorrowCapacityLimit`](AccrualPosition.md#getborrowcapacitylimit)

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

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`getMaxCapacities`](AccrualPosition.md#getmaxcapacities)

***

### getRepayCapacityLimit()

> **getRepayCapacityLimit**(`loanTokenBalance`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:322](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L322)

#### Parameters

##### loanTokenBalance

`bigint`

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`getRepayCapacityLimit`](AccrualPosition.md#getrepaycapacitylimit)

***

### getWithdrawCollateralCapacityLimit()

> **getWithdrawCollateralCapacityLimit**(`options?`): [`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

Defined in: [packages/blue-sdk/src/position/Position.ts:316](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L316)

#### Parameters

##### options?

[`MaxWithdrawCollateralOptions`](../interfaces/MaxWithdrawCollateralOptions.md)

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`getWithdrawCollateralCapacityLimit`](AccrualPosition.md#getwithdrawcollateralcapacitylimit)

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

> **position**: [`AccrualPosition`](AccrualPosition.md)

##### shares

> **shares**: `bigint`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`repay`](AccrualPosition.md#repay)

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

> **position**: [`AccrualPosition`](AccrualPosition.md)

##### shares

> **shares**: `bigint`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`supply`](AccrualPosition.md#supply)

***

### supplyCollateral()

> **supplyCollateral**(`assets`): [`AccrualPosition`](AccrualPosition.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:245](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L245)

#### Parameters

##### assets

`bigint`

#### Returns

[`AccrualPosition`](AccrualPosition.md)

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`supplyCollateral`](AccrualPosition.md#supplycollateral)

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

> **position**: [`AccrualPosition`](AccrualPosition.md)

##### shares

> **shares**: `bigint`

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`withdraw`](AccrualPosition.md#withdraw)

***

### withdrawCollateral()

> **withdrawCollateral**(`assets`, `timestamp?`): [`AccrualPosition`](AccrualPosition.md)

Defined in: [packages/blue-sdk/src/position/Position.ts:251](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/position/Position.ts#L251)

#### Parameters

##### assets

`bigint`

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

[`AccrualPosition`](AccrualPosition.md)

#### Inherited from

[`AccrualPosition`](AccrualPosition.md).[`withdrawCollateral`](AccrualPosition.md#withdrawcollateral)
