[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / IPosition

# Interface: IPosition

Defined in: [packages/midnight-sdk/src/position/Position.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L27)

Plain input accepted by [Position](../classes/Position.md).

## Example

```ts
import type { IPosition } from "@morpho-org/midnight-sdk";

const position: IPosition = {
  user: "0x0000000000000000000000000000000000009000",
  marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
  credit: 0n,
  pendingFee: 0n,
  lastLossFactor: 0n,
  lastAccrual: 0n,
  debt: 0n,
  collateralBitmap: 0n,
  collateral: Array.from({ length: 128 }, () => 0n),
};
```

## Properties

### collateral

> `readonly` **collateral**: readonly [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)[]

Defined in: [packages/midnight-sdk/src/position/Position.ts:45](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L45)

Collateral balances by index.

***

### collateralBitmap

> `readonly` **collateralBitmap**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L43)

Collateral bitmap.

***

### credit

> `readonly` **credit**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L33)

User credit.

***

### debt

> `readonly` **debt**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L41)

User debt.

***

### lastAccrual

> `readonly` **lastAccrual**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L39)

Last accrual timestamp.

***

### lastLossFactor

> `readonly` **lastLossFactor**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L37)

Last loss factor seen by the position.

***

### marketId

> `readonly` **marketId**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/position/Position.ts:31](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L31)

Id of the market on which this position is held.

***

### pendingFee

> `readonly` **pendingFee**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:35](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L35)

Pending continuous fee.

***

### user

> `readonly` **user**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/position/Position.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L29)

User holding this position.
