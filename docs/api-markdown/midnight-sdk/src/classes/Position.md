[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / Position

# Class: Position

Defined in: [packages/midnight-sdk/src/position/Position.ts:69](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L69)

Midnight user position as stored by the core contract.

## Example

```ts
import { Position } from "@morpho-org/midnight-sdk";

const position = new Position({
  user: "0x0000000000000000000000000000000000009000",
  marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
  credit: 0n,
  pendingFee: 0n,
  lastLossFactor: 0n,
  lastAccrual: 0n,
  debt: 0n,
  collateralBitmap: 0n,
  collateral: [],
});
console.log(position.debt);
```

## Extended by

- [`AccrualPosition`](AccrualPosition.md)

## Implements

- [`IPosition`](../interfaces/IPosition.md)

## Constructors

### Constructor

> **new Position**(`position`): `Position`

Defined in: [packages/midnight-sdk/src/position/Position.ts:97](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L97)

#### Parameters

##### position

[`IPosition`](../interfaces/IPosition.md)

#### Returns

`Position`

## Properties

### collateral

> `readonly` **collateral**: readonly `bigint`[]

Defined in: [packages/midnight-sdk/src/position/Position.ts:95](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L95)

Collateral balances by index.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`collateral`](../interfaces/IPosition.md#collateral)

***

### collateralBitmap

> `readonly` **collateralBitmap**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:92](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L92)

Collateral bitmap.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`collateralBitmap`](../interfaces/IPosition.md#collateralbitmap)

***

### credit

> `readonly` **credit**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:77](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L77)

User credit.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`credit`](../interfaces/IPosition.md#credit)

***

### debt

> `readonly` **debt**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:89](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L89)

User debt.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`debt`](../interfaces/IPosition.md#debt)

***

### lastAccrual

> `readonly` **lastAccrual**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:86](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L86)

Last accrual timestamp.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`lastAccrual`](../interfaces/IPosition.md#lastaccrual)

***

### lastLossFactor

> `readonly` **lastLossFactor**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:83](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L83)

Last loss factor seen by the position.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`lastLossFactor`](../interfaces/IPosition.md#lastlossfactor)

***

### marketId

> `readonly` **marketId**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/position/Position.ts:74](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L74)

Id of the market on which this position is held.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`marketId`](../interfaces/IPosition.md#marketid)

***

### pendingFee

> `readonly` **pendingFee**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:80](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L80)

Pending continuous fee.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`pendingFee`](../interfaces/IPosition.md#pendingfee)

***

### user

> `readonly` **user**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/position/Position.ts:71](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L71)

User holding this position.

#### Implementation of

[`IPosition`](../interfaces/IPosition.md).[`user`](../interfaces/IPosition.md#user)

## Accessors

### faceValue

#### Get Signature

> **get** **faceValue**(): `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:131](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L131)

Returns credit net of pending fee, floored to zero for invalid raw inputs.

##### Example

```ts
import { Position } from "@morpho-org/midnight-sdk";

const position = new Position({
  user: "0x0000000000000000000000000000000000009000",
  marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
  credit: 1_000n,
  pendingFee: 100n,
  lastLossFactor: 0n,
  lastAccrual: 0n,
  debt: 0n,
  collateralBitmap: 1n,
  collateral: [50n],
});
console.log(position.faceValue);
```

##### Returns

`bigint`

Credit minus pending fee.
