[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / BuildOfferParams

# Interface: BuildOfferParams

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:798](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L798)

Parameters for [Offer.create](../classes/Offer.md#create).

These are make-side parameters entered by a maker or order-management app
before any tree, ratifier data, or mempool payload exists. The optional
`group` field is useful when instantiating an offer that already belongs to a
protocol group, such as an offer returned by the Midnight API. Omit it for
fresh maker-side offers that will be grouped with `Group.create`.

## Example

```ts
import type { BuildOfferParams } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

const params: BuildOfferParams = {
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
  tick: 5_000n,
  group: "0x1111111111111111111111111111111111111111111111111111111111111111",
  expiry: 2_100n,
  ratifier: "0x0000000000000000000000000000000000004000",
  maxAssets: 100n,
};
console.log(params.group);
```

## Properties

### buy

> `readonly` **buy**: `boolean`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:802](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L802)

Whether the maker buys units.

***

### callback?

> `readonly` `optional` **callback?**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:825](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L825)

Callback address; defaults to zero address.

***

### callbackData?

> `readonly` `optional` **callbackData?**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:827](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L827)

Callback payload; defaults to `0x`.

***

### continuousFeeCap?

> `readonly` `optional` **continuousFeeCap?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:819](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L819)

Maximum market continuous fee accepted by this offer; defaults to zero.

***

### expiry

> `readonly` **expiry**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:823](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L823)

Offer expiry timestamp.

***

### group?

> `readonly` `optional` **group?**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:811](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L811)

Optional consumption group id for already-grouped offers, such as offers
decoded from the API. Omit for fresh maker-side offers.

***

### maker

> `readonly` **maker**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:804](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L804)

Maker address.

***

### market

> `readonly` **market**: [`IMarketParams`](IMarketParams.md) \| [`IMarket`](IMarket.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:800](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L800)

Market this offer trades.

***

### maxAssets?

> `readonly` `optional` **maxAssets?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:817](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L817)

Maximum buyer or seller assets; defaults to zero. Exactly one of `maxUnits` and `maxAssets` must be non-zero.

***

### maxUnits?

> `readonly` `optional` **maxUnits?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:815](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L815)

Maximum units; defaults to zero. Exactly one of `maxUnits` and `maxAssets` must be non-zero.

***

### ratifier

> `readonly` **ratifier**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:831](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L831)

Ratifier contract.

***

### receiverIfMakerIsSeller?

> `readonly` `optional` **receiverIfMakerIsSeller?**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:829](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L829)

Receiver used when maker is seller; defaults to zero for buy offers and maker for sell offers.

***

### reduceOnly?

> `readonly` `optional` **reduceOnly?**: `boolean`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:833](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L833)

Whether the offer can only reduce maker exposure.

***

### start?

> `readonly` `optional` **start?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:821](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L821)

Offer start timestamp; defaults to zero.

***

### tick

> `readonly` **tick**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:806](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L806)

Tick.

***

### tickSpacing?

> `readonly` `optional` **tickSpacing?**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:813](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L813)

Market tick spacing; defaults to the protocol's default spacing.
