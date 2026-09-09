[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [PositionUtils](../README.md) / accrueInterest

# Function: accrueInterest()

> **accrueInterest**(`params`): `object`

Defined in: [packages/midnight-sdk/src/position/PositionUtils.ts:151](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/PositionUtils.ts#L151)

Returns plain Midnight position and market objects accrued like Midnight `updatePositionView`.

## Parameters

### params

#### market

[`IMarket`](../../../interfaces/IMarket.md)

Hydrated market state used for loss factor and continuous-fee accrual.

#### position

[`IPosition`](../../../interfaces/IPosition.md)

Position state to accrue.

#### timestamp

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Timestamp at which to accrue.

## Returns

`object`

New plain position and market objects with updated credit, pending fee, last loss factor, last accrual, and market continuous-fee credit.

### accruedFee

> `readonly` **accruedFee**: `bigint`

### market

> `readonly` **market**: [`IMarket`](../../../interfaces/IMarket.md)

### position

> `readonly` **position**: [`IPosition`](../../../interfaces/IPosition.md)

## Throws

when timestamp is before `lastAccrual`.

## Throws

when the market loss factor is older than the position loss factor.

## Throws

when raw inputs violate Midnight accounting invariants.

## Example

```ts
import { PositionUtils } from "@morpho-org/midnight-sdk";

const { position, market } = PositionUtils.accrueInterest({
  position: {
    user: "0x0000000000000000000000000000000000009000",
    marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
    credit: 1_000n,
    pendingFee: 100n,
    lastLossFactor: 0n,
    lastAccrual: 1_000n,
    debt: 0n,
    collateralBitmap: 1n,
    collateral: [50n],
  },
  market: {
    params: {
      chainId: 8453,
      midnight: "0x0000000000000000000000000000000000001000",
      loanToken: "0x0000000000000000000000000000000000006000",
      collateralParams: [
        {
          token: "0x0000000000000000000000000000000000007000",
          lltv: 770000000000000000n,
          liquidationCursor: 250000000000000000n,
          oracle: "0x0000000000000000000000000000000000008000",
        },
      ],
      maturity: 54_000n,
      rcfThreshold: 0n,
      enterGate: "0x0000000000000000000000000000000000000000",
      liquidatorGate: "0x0000000000000000000000000000000000000000",
    },
    totalUnits: 1_000n,
    lossFactor: 0n,
    withdrawable: 500n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
    continuousFee: 10,
    tickSpacing: 4,
  },
  timestamp: 1_500n,
});
console.log(position.lastAccrual, market.continuousFeeCredit);
```
