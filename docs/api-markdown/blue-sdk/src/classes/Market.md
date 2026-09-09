[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / Market

# Class: Market

Defined in: [packages/blue-sdk/src/market/Market.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L48)

Represents a lending market on Morpho Blue.

## Implements

- [`IMarket`](../interfaces/IMarket.md)

## Constructors

### Constructor

> **new Market**(`__namedParameters`): `Market`

Defined in: [packages/blue-sdk/src/market/Market.ts:92](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L92)

#### Parameters

##### \_\_namedParameters

[`IMarket`](../interfaces/IMarket.md)

#### Returns

`Market`

## Properties

### fee

> **fee**: `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:78](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L78)

The fee percentage of the market, scaled by WAD.

#### Implementation of

[`IMarket`](../interfaces/IMarket.md).[`fee`](../interfaces/IMarket.md#fee)

***

### lastUpdate

> **lastUpdate**: `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:74](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L74)

The block timestamp (in __seconds__) when the interest was last accrued.

#### Implementation of

[`IMarket`](../interfaces/IMarket.md).[`lastUpdate`](../interfaces/IMarket.md#lastupdate)

***

### params

> `readonly` **params**: [`MarketParams`](MarketParams.md)

Defined in: [packages/blue-sdk/src/market/Market.ts:52](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L52)

The market's params.

#### Implementation of

[`IMarket`](../interfaces/IMarket.md).[`params`](../interfaces/IMarket.md#params)

***

### price?

> `optional` **price?**: `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:84](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L84)

The price as returned by the market's oracle.
`undefined` if the oracle is undefined or reverts.

#### Implementation of

[`IMarket`](../interfaces/IMarket.md).[`price`](../interfaces/IMarket.md#price)

***

### rateAtTarget?

> `optional` **rateAtTarget?**: `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:90](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L90)

If the market uses the Adaptive Curve IRM, the rate at target utilization.
Undefined otherwise.

#### Implementation of

[`IMarket`](../interfaces/IMarket.md).[`rateAtTarget`](../interfaces/IMarket.md#rateattarget)

***

### totalBorrowAssets

> **totalBorrowAssets**: `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:61](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L61)

The amount of loan assets supplied in total on the market.

#### Implementation of

[`IMarket`](../interfaces/IMarket.md).[`totalBorrowAssets`](../interfaces/IMarket.md#totalborrowassets)

***

### totalBorrowShares

> **totalBorrowShares**: `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:69](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L69)

The amount of loan assets supplied in total on the market.

#### Implementation of

[`IMarket`](../interfaces/IMarket.md).[`totalBorrowShares`](../interfaces/IMarket.md#totalborrowshares)

***

### totalSupplyAssets

> **totalSupplyAssets**: `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L57)

The amount of loan assets supplied in total on the market.

#### Implementation of

[`IMarket`](../interfaces/IMarket.md).[`totalSupplyAssets`](../interfaces/IMarket.md#totalsupplyassets)

***

### totalSupplyShares

> **totalSupplyShares**: `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:65](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L65)

The amount of loan assets supplied in total on the market.

#### Implementation of

[`IMarket`](../interfaces/IMarket.md).[`totalSupplyShares`](../interfaces/IMarket.md#totalsupplyshares)

## Accessors

### apyAtTarget

#### Get Signature

> **get** **apyAtTarget**(): `number` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:148](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L148)

The market's Annual Percentage Yield (APY) at the IRM's target utilization rate, if applicable.

##### Returns

`number` \| `undefined`

***

### avgBorrowRate

#### Get Signature

> **get** **avgBorrowRate**(): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:181](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L181)

Returns the average rate at which interest _would_ accrue from `lastUpdate`
till now, if `accrueInterest` was called immediately onchain (scaled by WAD).
If `accrueInterest` was just called, the average rate equals the instantaneous rate,
so it is equivalent to `getBorrowRate(lastUpdate)`.

In most cases, `accrueInterest` will not be called immediately onchain,
so the average rate is only an intermediary value.

If interested in the average rate experienced by existing market actors at a specific timestamp,
use `getAvgBorrowRate(timestamp)`, `getAvgBorrowApy(timestamp)`, or `getAvgSupplyApy(timestamp)` instead.

##### Returns

`bigint`

***

### borrowApy

#### Get Signature

> **get** **borrowApy**(): `number`

Defined in: [packages/blue-sdk/src/market/Market.ts:197](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L197)

The market's current, instantaneous borrow-side Annual Percentage Yield (APY).
If interested in the APY at a specific timestamp, use `getBorrowApy(timestamp)` instead.

##### Returns

`number`

***

### endBorrowRate

#### Get Signature

> **get** **endBorrowRate**(): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:165](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L165)

Returns the instantaneous rate at which interest accrues for borrowers of this market,
if `accrueInterest` was called immediately onchain (scaled by WAD).

Even if `accrueInterest` is called immediately onchain,
the instantaneous rate only corresponds to an intermediary value used to calculate
the actual average rate experienced by borrowers of this market.

If interested in the instantaneous rate experienced by existing market actors at a specific timestamp,
use `getEndBorrowRate(timestamp)`, `getBorrowApy(timestamp)`, or `getSupplyApy(timestamp)` instead.

##### Returns

`bigint`

***

### id

#### Get Signature

> **get** **id**(): [`MarketId`](../type-aliases/MarketId.md)

Defined in: [packages/blue-sdk/src/market/Market.ts:119](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L119)

The market's hex-encoded id, defined as the hash of the market params.

##### Returns

[`MarketId`](../type-aliases/MarketId.md)

***

### isIdle

#### Get Signature

> **get** **isIdle**(): `boolean`

Defined in: [packages/blue-sdk/src/market/Market.ts:126](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L126)

Whether the market satisfies the canonical definition of an idle market (i.e. collateral token is the zero address).

##### Returns

`boolean`

***

### liquidity

#### Get Signature

> **get** **liquidity**(): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:134](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L134)

##### Warning

Cannot be used to calculate the liquidity available inside a callback,
because the balance of Blue may be lower than the market's liquidity due to assets being transferred out prior to the callback.

##### Returns

`bigint`

***

### supplyApy

#### Get Signature

> **get** **supplyApy**(): `number`

Defined in: [packages/blue-sdk/src/market/Market.ts:189](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L189)

The market's current, instantaneous supply-side Annual Percentage Yield (APY).
If interested in the APY at a specific timestamp, use `getSupplyApy(timestamp)` instead.

##### Returns

`number`

***

### utilization

#### Get Signature

> **get** **utilization**(): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:141](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L141)

The market's utilization rate (scaled by WAD).

##### Returns

`bigint`

## Methods

### accrueInterest()

> **accrueInterest**(`timestamp?`): `Market`

Defined in: [packages/blue-sdk/src/market/Market.ts:343](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L343)

Returns a new market derived from this market, whose interest has been accrued up to the given timestamp.

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md) = `...`

The timestamp at which to accrue interest.
Must be greater than or equal to `lastUpdate`.
Defaults to `lastUpdate` (returns a copy of the market).

#### Returns

`Market`

***

### borrow()

> **borrow**(`assets`, `shares`, `timestamp?`): `object`

Defined in: [packages/blue-sdk/src/market/Market.ts:406](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L406)

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

##### market

> **market**: `Market`

##### shares

> **shares**: `bigint`

***

### getAccrualBorrowRates()

> `protected` **getAccrualBorrowRates**(`timestamp?`): `object`

Defined in: [packages/blue-sdk/src/market/Market.ts:232](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L232)

Returns the rates that _would_ apply to interest accrual for borrowers of this market,
if `accrueInterest` was called at the given timestamp (scaled by WAD).

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md) = `...`

The timestamp at which to calculate the accrual borrow rate.
Must be greater than or equal to `lastUpdate`.
Defaults to `Time.timestamp()` (returns the current accrual borrow rate).

#### Returns

`object`

##### avgBorrowRate

> **avgBorrowRate**: `bigint`

##### elapsed

> **elapsed**: `bigint`

##### endBorrowRate

> **endBorrowRate**: `bigint`

##### endRateAtTarget?

> `optional` **endRateAtTarget?**: `bigint`

***

### getAvgBorrowApy()

> **getAvgBorrowApy**(`timestamp?`): `number`

Defined in: [packages/blue-sdk/src/market/Market.ts:304](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L304)

The market's experienced borrow-side Annual Percentage Yield (APY),
if interest was to be accrued at the given timestamp.

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md) = `...`

The timestamp at which to calculate the borrow APY.
Must be greater than or equal to `lastUpdate`.
Defaults to `Time.timestamp()` (returns the current borrow APY).

#### Returns

`number`

***

### getAvgBorrowRate()

> **getAvgBorrowRate**(`timestamp?`): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:221](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L221)

Returns the average rate at which interest _would_ accrue for borrowers of this market,
if `accrueInterest` was called at the given timestamp (scaled by WAD).

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md) = `...`

The timestamp at which to calculate the average borrow rate.
Must be greater than or equal to `lastUpdate`.
Defaults to `Time.timestamp()` (returns the current average borrow rate).

#### Returns

`bigint`

***

### getAvgSupplyApy()

> **getAvgSupplyApy**(`timestamp?`): `number`

Defined in: [packages/blue-sdk/src/market/Market.ts:333](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L333)

The market's experienced supply-side Annual Percentage Yield (APY),
if interest was to be accrued at the given timestamp.

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md) = `...`

The timestamp at which to calculate the supply APY.
Must be greater than or equal to `lastUpdate`.
Defaults to `Time.timestamp()` (returns the current supply APY).

#### Returns

`number`

***

### getAvgSupplyRate()

> **getAvgSupplyRate**(`timestamp?`): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:317](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L317)

Returns the average rate at which interest _would_ accrue for suppliers of this market,
if `accrueInterest` was called at the given timestamp (scaled by WAD).

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md) = `...`

The timestamp at which to calculate the average supply rate.
Must be greater than or equal to `lastUpdate`.
Defaults to `Time.timestamp()` (returns the current average supply rate).

#### Returns

`bigint`

***

### getBorrowApy()

> **getBorrowApy**(`timestamp?`): `number`

Defined in: [packages/blue-sdk/src/market/Market.ts:273](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L273)

The market's instantaneous borrow-side Annual Percentage Yield (APY) at the given timestamp,
if the state remains unchanged (not accrued).

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md) = `...`

The timestamp at which to calculate the borrow APY.
Must be greater than or equal to `lastUpdate`.
Defaults to `Time.timestamp()` (returns the current borrow APY).

#### Returns

`number`

***

### getBorrowCapacityLimit()

> **getBorrowCapacityLimit**(`position`, `options?`): [`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:677](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L677)

Returns the maximum amount of loan assets that can be borrowed given a certain borrow position
and the reason for the limit.
Returns `undefined` iff the market's price is undefined.

#### Parameters

##### position

The borrow position to consider.

###### borrowShares?

`bigint` = `0n`

###### collateral

`bigint`

##### options?

[`MaxBorrowOptions`](../interfaces/MaxBorrowOptions.md)

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

***

### getBorrowCapacityUsage()

> **getBorrowCapacityUsage**(`position`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:664](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L664)

Returns the usage ratio of the maximum borrow capacity given a certain borrow position (scaled by WAD).

#### Parameters

##### position

The borrow position to consider.

###### borrowShares

`bigint`

###### collateral

`bigint`

#### Returns

`bigint` \| `undefined`

***

### getBorrowToUtilization()

> **getBorrowToUtilization**(`utilization`): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:500](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L500)

Returns the liquidity available to borrow until the market gets the closest to the given utilization rate.

#### Parameters

##### utilization

`bigint`

The target utilization rate (scaled by WAD).

#### Returns

`bigint`

***

### getCollateralValue()

> **getCollateralValue**(`collateral`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:517](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L517)

Returns the value of a given amount of collateral quoted in loan assets.
`undefined` iff the market's oracle is undefined or reverts.

#### Parameters

##### collateral

`bigint`

The amount of collateral to quote.

#### Returns

`bigint` \| `undefined`

***

### getEndBorrowRate()

> **getEndBorrowRate**(`timestamp?`): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:210](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L210)

Returns the instantaneous rate at which interest accrues for borrowers of this market,
at the given timestamp, if the state remains unchanged (not accrued) (scaled by WAD).
It is fundamentally different from the rate at which interest is paid by borrowers to lenders in the case of an interest accrual,
as in the case of the AdaptiveCurveIRM, the (approximated) average rate since the last update is used instead.

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md) = `...`

The timestamp at which to calculate the borrow rate.
Must be greater than or equal to `lastUpdate`.
Defaults to `Time.timestamp()` (returns the current borrow rate).

#### Returns

`bigint`

***

### getHealthFactor()

> **getHealthFactor**(`position`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:645](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L645)

Returns the health factor of a given borrow position (scaled by WAD).

#### Parameters

##### position

The borrow position to consider.

###### borrowShares

`bigint`

###### collateral

`bigint`

#### Returns

`bigint` \| `undefined`

***

### getLiquidationPrice()

> **getLiquidationPrice**(`position`): `bigint` \| `null`

Defined in: [packages/blue-sdk/src/market/Market.ts:616](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L616)

Returns the liquidation price of a given borrow position.

#### Parameters

##### position

The borrow position to consider.

###### borrowShares

`bigint`

###### collateral

`bigint`

#### Returns

`bigint` \| `null`

***

### getLiquidationRepaidShares()

> **getLiquidationRepaidShares**(`seizedAssets`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:566](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L566)

Returns the amount of borrow shares that would be repaid in a liquidation given a certain amount of seized collateral.
`undefined` iff the market's oracle is undefined or reverts.

#### Parameters

##### seizedAssets

`bigint`

The amount of collateral hypothetically seized.

#### Returns

`bigint` \| `undefined`

***

### getLiquidationSeizedAssets()

> **getLiquidationSeizedAssets**(`repaidShares`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:553](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L553)

Returns the amount of collateral that would be seized in a liquidation given a certain amount of repaid shares.
`undefined` iff the market's oracle is undefined or reverts.

#### Parameters

##### repaidShares

`bigint`

The amount of shares hypothetically repaid.

#### Returns

`bigint` \| `undefined`

***

### getLtv()

> **getLtv**(`position`): `bigint` \| `null` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:656](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L656)

Returns the loan-to-value ratio of a given borrow position (scaled by WAD).

#### Parameters

##### position

The borrow position to consider.

###### borrowShares

`bigint`

###### collateral

`bigint`

#### Returns

`bigint` \| `null` \| `undefined`

***

### getMaxBorrowableAssets()

> **getMaxBorrowableAssets**(`position`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:541](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L541)

Returns the maximum amount of loan assets that can be borrowed given a certain borrow position.
`undefined` iff the market's oracle is undefined or reverts.

#### Parameters

##### position

The borrow position to consider.

###### borrowShares

`bigint`

###### collateral

`bigint`

#### Returns

`bigint` \| `undefined`

***

### getMaxBorrowAssets()

> **getMaxBorrowAssets**(`collateral`, `__namedParameters?`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:527](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L527)

Returns the maximum debt allowed given a certain amount of collateral.
`undefined` iff the market's oracle is undefined or reverts.
To calculate the amount of loan assets that can be borrowed, use `getMaxBorrowableAssets`.

#### Parameters

##### collateral

`bigint`

The amount of collateral to consider.

##### \_\_namedParameters?

[`MaxBorrowOptions`](../interfaces/MaxBorrowOptions.md) = `{}`

#### Returns

`bigint` \| `undefined`

***

### getMaxCapacities()

> **getMaxCapacities**(`position`, `loanTokenBalance`, `collateralTokenBalance`, `options?`): [`MaxPositionCapacities`](../interfaces/MaxPositionCapacities.md)

Defined in: [packages/blue-sdk/src/market/Market.ts:797](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L797)

Returns the maximum capacity for all interactions with Morpho Blue given a certain position
and loan and collateral balances.

#### Parameters

##### position

The position to consider.

###### borrowShares

`bigint`

###### collateral

`bigint`

###### supplyShares

`bigint`

##### loanTokenBalance

`bigint`

The balance of loan assets.

##### collateralTokenBalance

`bigint`

The balance of collateral assets.

##### options?

###### borrow?

[`MaxBorrowOptions`](../interfaces/MaxBorrowOptions.md)

###### withdrawCollateral?

[`MaxWithdrawCollateralOptions`](../interfaces/MaxWithdrawCollateralOptions.md)

#### Returns

[`MaxPositionCapacities`](../interfaces/MaxPositionCapacities.md)

***

### getPriceVariationToLiquidationPrice()

> **getPriceVariationToLiquidationPrice**(`position`): `bigint` \| `null` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:630](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L630)

Returns the price variation required for the given position to reach its liquidation threshold (scaled by WAD).
Negative when healthy (the price needs to drop x%), positive when unhealthy (the price needs to soar x%).
Returns `undefined` iff the market's price is undefined.
Returns null if the position is not a borrow.

#### Parameters

##### position

The borrow position to consider.

###### borrowShares

`bigint`

###### collateral

`bigint`

#### Returns

`bigint` \| `null` \| `undefined`

***

### getRepayCapacityLimit()

> **getRepayCapacityLimit**(`borrowShares`, `loanTokenBalance`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/market/Market.ts:715](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L715)

Returns the maximum amount of loan assets that can be repaid given a certain borrow position
and a balance of loan assets, and the reason for the limit.

#### Parameters

##### borrowShares

`bigint`

##### loanTokenBalance

`bigint`

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

***

### getRepayToUtilization()

> **getRepayToUtilization**(`utilization`): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:508](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L508)

Returns the smallest volume to repay until the market gets the closest to the given utilization rate.

#### Parameters

##### utilization

`bigint`

The target utilization rate (scaled by WAD).

#### Returns

`bigint`

***

### getSeizableCollateral()

> **getSeizableCollateral**(`position`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:579](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L579)

Returns the maximum amount of collateral that is worth being seized in a liquidation given a certain borrow position.
`undefined` iff the market's oracle is undefined or reverts.

#### Parameters

##### position

The borrow position to consider.

###### borrowShares

`bigint`

###### collateral

`bigint`

#### Returns

`bigint` \| `undefined`

***

### getSupplyApy()

> **getSupplyApy**(`timestamp?`): `number`

Defined in: [packages/blue-sdk/src/market/Market.ts:286](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L286)

The market's instantaneous supply-side Annual Percentage Yield (APY) at the given timestamp,
if the state remains unchanged (not accrued).

#### Parameters

##### timestamp?

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md) = `...`

The timestamp at which to calculate the supply APY.
Must be greater than or equal to `lastUpdate`.
Defaults to `Time.timestamp()` (returns the current supply APY).

#### Returns

`number`

***

### getSupplyToUtilization()

> **getSupplyToUtilization**(`utilization`): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:484](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L484)

Returns the smallest volume to supply until the market gets the closest to the given utilization rate.

#### Parameters

##### utilization

`bigint`

The target utilization rate (scaled by WAD).

#### Returns

`bigint`

***

### getWithdrawableCollateral()

> **getWithdrawableCollateral**(`position`, `__namedParameters?`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:591](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L591)

Returns the amount of collateral that can be withdrawn given a certain borrow position.
`undefined` iff the market's oracle is undefined or reverts.

#### Parameters

##### position

The borrow position to consider.

###### borrowShares

`bigint`

###### collateral

`bigint`

##### \_\_namedParameters?

[`MaxWithdrawCollateralOptions`](../interfaces/MaxWithdrawCollateralOptions.md) = `{}`

#### Returns

`bigint` \| `undefined`

***

### getWithdrawCapacityLimit()

> **getWithdrawCapacityLimit**(`position`): [`CapacityLimit`](../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/market/Market.ts:738](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L738)

Returns the maximum amount of loan assets that can be withdrawn given a certain supply position
and a balance of loan assets, and the reason for the limit.

#### Parameters

##### position

The supply position to consider.

###### supplyShares

`bigint`

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md)

***

### getWithdrawCollateralCapacityLimit()

> **getWithdrawCollateralCapacityLimit**(`position`, `options?`): [`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:764](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L764)

Returns the maximum amount of collateral assets that can be withdrawn given a certain borrow position
and the reason for the limit.
Returns `undefined` iff the market's price is undefined.

#### Parameters

##### position

The borrow position to consider.

###### borrowShares

`bigint`

###### collateral

`bigint`

##### options?

[`MaxWithdrawCollateralOptions`](../interfaces/MaxWithdrawCollateralOptions.md)

#### Returns

[`CapacityLimit`](../interfaces/CapacityLimit.md) \| `undefined`

***

### getWithdrawToUtilization()

> **getWithdrawToUtilization**(`utilization`): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:492](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L492)

Returns the liquidity available to withdraw until the market gets the closest to the given utilization rate.

#### Parameters

##### utilization

`bigint`

The target utilization rate (scaled by WAD).

#### Returns

`bigint`

***

### isHealthy()

> **isHealthy**(`position`): `boolean` \| `undefined`

Defined in: [packages/blue-sdk/src/market/Market.ts:608](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L608)

Returns whether a given borrow position is healthy.
`undefined` iff the market's oracle is undefined or reverts.

#### Parameters

##### position

The borrow position to check.

###### borrowShares

`bigint`

###### collateral

`bigint`

#### Returns

`boolean` \| `undefined`

***

### repay()

> **repay**(`assets`, `shares`, `timestamp?`): `object`

Defined in: [packages/blue-sdk/src/market/Market.ts:427](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L427)

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

##### market

> **market**: `Market`

##### shares

> **shares**: `bigint`

***

### supply()

> **supply**(`assets`, `shares`, `timestamp?`): `object`

Defined in: [packages/blue-sdk/src/market/Market.ts:367](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L367)

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

##### market

> **market**: `Market`

##### shares

> **shares**: `bigint`

***

### toBorrowAssets()

> **toBorrowAssets**(`shares`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:467](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L467)

Converts a given amount of borrow shares into borrow loan assets.

#### Parameters

##### shares

`bigint`

The amount of shares to convert.

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md)

The rounding direction to use (defaults to "Up").

#### Returns

`bigint`

***

### toBorrowShares()

> **toBorrowShares**(`assets`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:476](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L476)

Converts a given amount of borrow loan assets into borrow shares.

#### Parameters

##### assets

`bigint`

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md)

The rounding direction to use (defaults to "Down").

#### Returns

`bigint`

***

### toSupplyAssets()

> **toSupplyAssets**(`shares`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:449](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L449)

Converts a given amount of supply shares into supply loan assets.

#### Parameters

##### shares

`bigint`

The amount of shares to convert.

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md)

The rounding direction to use (defaults to "Down").

#### Returns

`bigint`

***

### toSupplyShares()

> **toSupplyShares**(`assets`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/market/Market.ts:458](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L458)

Converts a given amount of supply loan assets into supply shares.

#### Parameters

##### assets

`bigint`

##### rounding?

[`RoundingDirection`](../../../morpho-ts/src/type-aliases/RoundingDirection.md)

The rounding direction to use (defaults to "Up").

#### Returns

`bigint`

***

### withdraw()

> **withdraw**(`assets`, `shares`, `timestamp?`): `object`

Defined in: [packages/blue-sdk/src/market/Market.ts:385](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/Market.ts#L385)

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

##### market

> **market**: `Market`

##### shares

> **shares**: `bigint`
