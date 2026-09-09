[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / midnightTakeLend

# Function: midnightTakeLend()

> **midnightTakeLend**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightTakeLendAction`](../interfaces/MidnightTakeLendAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/midnight/takeLend.ts:74](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeLend.ts#L74)

Encodes a Midnight bundle that lends loan assets by taking borrow-side offers.

Prefer `client.morpho.midnight(chainId).takeLend(...)` in app flows so
approval and authorization requirements are resolved first. Use this
low-level builder only after the Midnight API has returned takeable offers
and the caller has already handled prerequisites.

## Parameters

### params

[`MidnightTakeLendParams`](../interfaces/MidnightTakeLendParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightTakeLendAction`](../interfaces/MidnightTakeLendAction.md)\>\>

A deep-frozen `Transaction<MidnightTakeLendAction>` targeting `MidnightBundles`.

## Throws

when `assets <= 0n`.

## Throws

when `minUnits` or `deadline` is negative.

## Throws

when no offers are provided.

## Throws

when any offer is not borrow-side.

## Throws

when any offer belongs to another market.

## Throws

when the market targets another chain.

## Throws

when the market targets another Midnight deployment.

## Example

```ts
import { maxUint256 } from "viem";
import { midnightTakeLend } from "@morpho-org/morpho-sdk";

const tx = midnightTakeLend({
  chainId: 8453,
  market: marketData.params,
  assets: 1_000_000n,
  minUnits: 900_000n,
  taker: lender,
  takeableOffers: quote.data.takeableOffers,
  deadline: maxUint256,
});
```
