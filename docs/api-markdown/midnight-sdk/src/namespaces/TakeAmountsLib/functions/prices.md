[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TakeAmountsLib](../README.md) / prices

# Function: prices()

> **prices**(`params`): `object`

Defined in: [packages/midnight-sdk/src/math/TakeAmountsLib.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TakeAmountsLib.ts#L49)

Computes buyer and seller prices for an offer and settlement fee.

## Parameters

### params

#### offer

\{ `buy`: `boolean`; `tick`: [`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md); \}

#### offer.buy

`boolean`

Whether the maker buys loan assets.

#### offer.tick

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Offer tick used to compute the base price.

#### settlementFee

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

WAD-scaled settlement fee for the market and time to maturity.

## Returns

`object`

Buyer and seller prices.

### buyerPrice

> **buyerPrice**: `bigint`

### sellerPrice

> **sellerPrice**: `bigint`

## Throws

when `settlementFee` or the offer tick is negative.

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

const prices = TakeAmountsLib.prices({ offer, settlementFee: 1_000000000000n });
console.log(prices.buyerPrice);
```
