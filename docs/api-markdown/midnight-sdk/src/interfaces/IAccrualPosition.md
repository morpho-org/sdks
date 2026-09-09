[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / IAccrualPosition

# Interface: IAccrualPosition

Defined in: [packages/midnight-sdk/src/position/Position.ts:137](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L137)

Plain input shape for a Midnight position paired with hydrated market state.

## Extends

- `Omit`\<[`IPosition`](IPosition.md), `"marketId"`\>

## Properties

### collateral

> `readonly` **collateral**: readonly [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)[]

Defined in: [packages/midnight-sdk/src/position/Position.ts:45](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L45)

Collateral balances by index.

#### Inherited from

[`IPosition`](IPosition.md).[`collateral`](IPosition.md#collateral)

***

### collateralBitmap

> `readonly` **collateralBitmap**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L43)

Collateral bitmap.

#### Inherited from

[`IPosition`](IPosition.md).[`collateralBitmap`](IPosition.md#collateralbitmap)

***

### credit

> `readonly` **credit**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L33)

User credit.

#### Inherited from

[`IPosition`](IPosition.md).[`credit`](IPosition.md#credit)

***

### debt

> `readonly` **debt**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L41)

User debt.

#### Inherited from

[`IPosition`](IPosition.md).[`debt`](IPosition.md#debt)

***

### lastAccrual

> `readonly` **lastAccrual**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L39)

Last accrual timestamp.

#### Inherited from

[`IPosition`](IPosition.md).[`lastAccrual`](IPosition.md#lastaccrual)

***

### lastLossFactor

> `readonly` **lastLossFactor**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L37)

Last loss factor seen by the position.

#### Inherited from

[`IPosition`](IPosition.md).[`lastLossFactor`](IPosition.md#lastlossfactor)

***

### pendingFee

> `readonly` **pendingFee**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:35](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L35)

Pending continuous fee.

#### Inherited from

[`IPosition`](IPosition.md).[`pendingFee`](IPosition.md#pendingfee)

***

### user

> `readonly` **user**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/position/Position.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L29)

User holding this position.

#### Inherited from

[`IPosition`](IPosition.md).[`user`](IPosition.md#user)
