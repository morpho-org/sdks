[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TakeAmountsLib](../README.md) / buyerAssetsToUnits

# Function: buyerAssetsToUnits()

> **buyerAssetsToUnits**(`params`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TakeAmountsLib.ts:103](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TakeAmountsLib.ts#L103)

Converts a target buyer-asset amount into units for an offer.

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

Offer tick used to compute the buyer price.

#### settlementFee

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

WAD-scaled settlement fee for the market and time to maturity.

#### targetBuyerAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Target buyer-side asset amount.

## Returns

`bigint`

Units that round-trip to the target buyer assets where reachable.

## Throws

when `targetBuyerAssets`, `settlementFee`, or the offer tick is negative.

## Throws

when the computed buyer price is zero.

## Throws

when buyer price is above WAD.

## Throws

when the offer tick exceeds `MAX_TICK`.

## Throws

when settlement fee exceeds a buy offer price.

## Example

```ts
import { TakeAmountsLib } from "@morpho-org/midnight-sdk";

const offer = {
  buy: true,
  tick: 5_820n,
};

const units = TakeAmountsLib.buyerAssetsToUnits({
  offer,
  targetBuyerAssets: 100n,
  settlementFee: 0n,
});
console.log(units);
```
