[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TakeAmountsLib](../README.md) / sellerAssetsToUnits

# Function: sellerAssetsToUnits()

> **sellerAssetsToUnits**(`params`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TakeAmountsLib.ts:159](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TakeAmountsLib.ts#L159)

Converts a target seller-asset amount into units for an offer.

`settlementFee` must be the fee for the offer market's current time to maturity.

## Parameters

### params

#### offer

\{ `buy`: `boolean`; `tick`: [`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md); \}

#### offer.buy

`boolean`

Whether the maker buys loan assets.

#### offer.tick

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Offer tick used to compute the seller price.

#### settlementFee

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

WAD-scaled settlement fee for the market and time to maturity.

#### targetSellerAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Target seller-side asset amount.

## Returns

`bigint`

Units that round-trip to the target seller assets where reachable.

## Throws

when `targetSellerAssets`, `settlementFee`, or the offer tick is negative.

## Throws

when the computed seller price is zero.

## Throws

when the offer tick exceeds `MAX_TICK`.

## Throws

when settlement fee exceeds a buy offer price.

## Example

```ts
import { TakeAmountsLib } from "@morpho-org/midnight-sdk";

const offer = {
  buy: false,
  tick: 5_820n,
};

const units = TakeAmountsLib.sellerAssetsToUnits({
  offer,
  targetSellerAssets: 100n,
  settlementFee: 0n,
});
console.log(units);
```
