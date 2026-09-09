[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / OfferStruct

# Interface: OfferStruct

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:722](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L722)

ABI tuple shape for `Offer`.

This is the shape consumed by viem encoders, Merkle leaf hashing, payload
encoding, and take calldata encoders. Build it with `OfferUtils.toStruct` or
`GroupUtils.toStructs`; grouped encoders derive a shared group id from the
offer list, while single-offer encoders read the offer's group unless an
explicit override is supplied.

## Example

```ts
import type { OfferStruct } from "@morpho-org/midnight-sdk";
import { zeroAddress, zeroHash } from "viem";

const offer: OfferStruct = {
  market: {
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
    maturity: 2_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  start: 0n,
  expiry: 2_100n,
  tick: 5_000n,
  group: zeroHash,
  callback: zeroAddress,
  callbackData: "0x",
  receiverIfMakerIsSeller: zeroAddress,
  ratifier: "0x0000000000000000000000000000000000004000",
  reduceOnly: false,
  maxUnits: 0n,
  maxAssets: 100n,
  continuousFeeCap: 317097919n,
};
console.log(offer.group);
```

## Properties

### buy

> `readonly` **buy**: `boolean`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:726](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L726)

Whether the maker buys units.

***

### callback

> `readonly` **callback**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:738](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L738)

Optional maker callback.

***

### callbackData

> `readonly` **callbackData**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:740](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L740)

Callback payload.

***

### continuousFeeCap

> `readonly` **continuousFeeCap**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:752](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L752)

Maximum market continuous fee accepted by this offer.

***

### expiry

> `readonly` **expiry**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:732](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L732)

Expiry timestamp.

***

### group

> `readonly` **group**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:736](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L736)

Consumption group.

***

### maker

> `readonly` **maker**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:728](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L728)

Offer maker.

***

### market

> `readonly` **market**: [`MarketParams`](../classes/MarketParams.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:724](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L724)

Market this offer trades.

***

### maxAssets

> `readonly` **maxAssets**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:750](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L750)

Maximum buyer or seller assets, depending on side.

***

### maxUnits

> `readonly` **maxUnits**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:748](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L748)

Maximum units; zero means max assets controls consumption.

***

### ratifier

> `readonly` **ratifier**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:744](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L744)

Ratifier contract.

***

### receiverIfMakerIsSeller

> `readonly` **receiverIfMakerIsSeller**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:742](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L742)

Receiver used when maker is seller.

***

### reduceOnly

> `readonly` **reduceOnly**: `boolean`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:746](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L746)

Whether the offer can only reduce maker exposure.

***

### start

> `readonly` **start**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:730](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L730)

Start timestamp.

***

### tick

> `readonly` **tick**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:734](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L734)

Midnight tick.
