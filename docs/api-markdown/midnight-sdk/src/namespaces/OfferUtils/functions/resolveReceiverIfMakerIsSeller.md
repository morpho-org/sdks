[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / resolveReceiverIfMakerIsSeller

# Function: resolveReceiverIfMakerIsSeller()

> **resolveReceiverIfMakerIsSeller**(`params`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:516](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L516)

Resolves and validates the maker-seller receiver field for an offer side.

Use this before `Offer.create` when side-specific receiver defaults must be
displayed to a maker. `Offer.create` calls it internally.

## Parameters

### params

#### buy

`boolean`

Whether the maker buys loan assets.

#### maker

`` `0x${string}` ``

Maker address used as the default sell-side receiver.

#### receiverIfMakerIsSeller?

`` `0x${string}` ``

Optional receiver used when maker is seller.

## Returns

`` `0x${string}` ``

Receiver address to put on the offer.

## Throws

when a buy offer sets a non-zero maker-seller receiver.

## Example

```ts
import { OfferUtils } from "@morpho-org/midnight-sdk";

const receiver = OfferUtils.resolveReceiverIfMakerIsSeller({
  buy: true,
  maker: "0x0000000000000000000000000000000000000001",
});
console.log(receiver);
```
