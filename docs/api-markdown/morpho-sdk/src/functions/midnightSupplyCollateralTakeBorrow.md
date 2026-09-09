[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / midnightSupplyCollateralTakeBorrow

# Function: midnightSupplyCollateralTakeBorrow()

> **midnightSupplyCollateralTakeBorrow**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightSupplyCollateralTakeBorrowAction`](../interfaces/MidnightSupplyCollateralTakeBorrowAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/midnight/supplyCollateralTakeBorrow.ts:66](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/supplyCollateralTakeBorrow.ts#L66)

Encodes a Midnight bundle that supplies collateral and borrows in one call.

Prefer `client.morpho.midnight(chainId).supplyCollateralTakeBorrow(...)` in
app flows so collateral approval and Midnight authorization requirements are
resolved before building the bundle. Use this low-level builder only after
market data and API takeable offers are already available.

## Parameters

### params

[`MidnightSupplyCollateralTakeBorrowParams`](../interfaces/MidnightSupplyCollateralTakeBorrowParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightSupplyCollateralTakeBorrowAction`](../interfaces/MidnightSupplyCollateralTakeBorrowAction.md)\>\>

A deep-frozen `Transaction<MidnightSupplyCollateralTakeBorrowAction>` targeting `MidnightBundles`.

## Throws

when collateral assets, loan assets, or `maxUnits` are non-positive.

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

## Throws

when `collateralIndex` is not configured on the market.

## Example

```ts
import { maxUint256 } from "viem";
import { midnightSupplyCollateralTakeBorrow } from "@morpho-org/morpho-sdk";

const tx = midnightSupplyCollateralTakeBorrow({
  chainId: 8453,
  market: marketData.params,
  collateralAssets: 2_000_000n,
  loanAssets: 1_000_000n,
  maxUnits: 1_100_000n,
  taker: borrower,
  takeableOffers: quote.data.takeableOffers,
  deadline: maxUint256,
});
```
