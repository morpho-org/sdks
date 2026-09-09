[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getAccruedInterest

# Function: getAccruedInterest()

> **getAccruedInterest**(`borrowRate`, `market`, `elapsed?`): `object`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:163](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L163)

Returns the interest accrued on both sides of the given market
as well as the supply shares minted to the fee recipient.

Fee shares are converted from the fee amount against post-interest supply assets minus the fee amount,
matching Morpho Blue's onchain accrual.

## Parameters

### borrowRate

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The average borrow rate since the last market update (scaled by WAD).

### market

#### fee

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market fee percentage, scaled by WAD.

#### totalBorrowAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total borrowed assets before accrual.

#### totalSupplyAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total supplied assets before accrual.

#### totalSupplyShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total supply shares before fee shares are minted.

### elapsed?

`bigint` = `0n`

The time elapsed since the last market update (in seconds).

## Returns

`object`

The accrued interest and the supply shares minted to the fee recipient.

### feeShares

> **feeShares**: `bigint`

### interest

> **interest**: `bigint`

## Example

```ts
import { MarketUtils, MathLib } from "@morpho-org/blue-sdk";

const { interest, feeShares } = MarketUtils.getAccruedInterest(
  5_0000000000000000n,
  {
    totalSupplyAssets: 1_000_000n * MathLib.WAD,
    totalBorrowAssets: 800_000n * MathLib.WAD,
    totalSupplyShares: 1_100_000n * MathLib.WAD,
    fee: 10_0000000000000000n,
  },
  1n,
);
// { interest, feeShares } satisfies { interest: bigint; feeShares: bigint }
```
