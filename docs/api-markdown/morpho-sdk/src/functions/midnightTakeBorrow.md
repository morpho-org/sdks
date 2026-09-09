[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / midnightTakeBorrow

# Function: midnightTakeBorrow()

> **midnightTakeBorrow**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightTakeBorrowAction`](../interfaces/MidnightTakeBorrowAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:74](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L74)

Encodes a Midnight bundle that borrows loan assets by taking lend-side offers.

Prefer `client.morpho.midnight(chainId).takeBorrow(...)` in app flows so
authorization requirements are resolved first. Use this low-level builder
only after the Midnight API has returned takeable offers and the caller has
already handled prerequisites.

## Parameters

### params

[`MidnightTakeBorrowParams`](../interfaces/MidnightTakeBorrowParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightTakeBorrowAction`](../interfaces/MidnightTakeBorrowAction.md)\>\>

A deep-frozen `Transaction<MidnightTakeBorrowAction>` targeting `MidnightBundles`.

## Throws

when `loanAssets` or `maxUnits` is non-positive.

## Throws

when `deadline` is negative.

## Throws

when no offers are provided.

## Throws

when any offer is not lend-side.

## Throws

when any offer belongs to another market.

## Throws

when the market targets another chain.

## Throws

when the market targets another Midnight deployment.

## Example

```ts
import { maxUint256 } from "viem";
import { midnightTakeBorrow } from "@morpho-org/morpho-sdk";

const tx = midnightTakeBorrow({
  chainId: 8453,
  market: marketData.params,
  loanAssets: 1_000_000n,
  maxUnits: 1_100_000n,
  taker: borrower,
  takeableOffers: quote.data.takeableOffers,
  deadline: maxUint256,
});
```
