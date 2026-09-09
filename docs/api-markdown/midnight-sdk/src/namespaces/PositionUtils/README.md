[**@morpho-org/sdks**](../../../../README.md)

***

[@morpho-org/sdks](../../../../README.md) / [midnight-sdk/src](../../README.md) / PositionUtils

# PositionUtils

Domain helpers for Midnight positions.

## Example

```ts
import { PositionUtils } from "@morpho-org/midnight-sdk";

const accrued = PositionUtils.accrueInterest({
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
console.log(accrued.position.credit);
```

## Functions

- [accrueInterest](functions/accrueInterest.md)
- [getWithdrawable](functions/getWithdrawable.md)
