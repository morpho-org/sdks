[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / IOffer

# Interface: IOffer

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:62](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L62)

Plain make-side offer input accepted by [Offer](../classes/Offer.md).

Use this shape when app or API data is already protocol-shaped and needs to
flow into `Offer.from`, `Group.create`, `Tree.create`, or
take-side conversion helpers. Use [Offer.create](../classes/Offer.md#create) instead for new maker
offers so deterministic fields are validated before grouping or signing.
The `group` field is optional. When omitted, [Offer.group](../classes/Offer.md#group) lazily
derives the content-addressed singleton group id from this offer's
zero-group hash. `Group.create` copies offers into a shared group and
overrides this field on the copies it owns.

## Example

```ts
import type { IOffer } from "@morpho-org/midnight-sdk";

const offer: IOffer = {
  market: {
    chainId: 8453,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken: "0x0000000000000000000000000000000000000001",
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000007000",
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity: 1n,
    rcfThreshold: 0n,
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000000002",
  start: 0n,
  expiry: 2n,
  tick: 100n,
  callback: "0x0000000000000000000000000000000000000000",
  callbackData: "0x",
  receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
  ratifier: "0x0000000000000000000000000000000000000003",
  reduceOnly: false,
  maxUnits: 0n,
  maxAssets: 100n,
  continuousFeeCap: 317097919n,
};
```

## Properties

### buy

> `readonly` **buy**: `boolean`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:66](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L66)

Whether the maker buys units.

***

### callback

> `readonly` **callback**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:78](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L78)

Optional maker callback.

***

### callbackData

> `readonly` **callbackData**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:80](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L80)

Callback payload.

***

### continuousFeeCap

> `readonly` **continuousFeeCap**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:92](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L92)

Maximum market continuous fee accepted by this offer.

***

### expiry

> `readonly` **expiry**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:72](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L72)

Expiry timestamp.

***

### group?

> `readonly` `optional` **group?**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:76](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L76)

Consumption group id; defaults to the content-addressed singleton group id.

***

### maker

> `readonly` **maker**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:68](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L68)

Offer maker.

***

### market

> `readonly` **market**: [`IMarketParams`](IMarketParams.md) \| [`IMarket`](IMarket.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:64](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L64)

Market this offer trades.

***

### maxAssets

> `readonly` **maxAssets**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:90](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L90)

Maximum buyer or seller assets, depending on side.

***

### maxUnits

> `readonly` **maxUnits**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:88](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L88)

Maximum units; zero means max assets controls consumption.

***

### ratifier

> `readonly` **ratifier**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:84](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L84)

Ratifier contract.

***

### receiverIfMakerIsSeller

> `readonly` **receiverIfMakerIsSeller**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:82](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L82)

Receiver used when the maker is the seller.

***

### reduceOnly

> `readonly` **reduceOnly**: `boolean`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:86](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L86)

Whether the offer can only reduce maker exposure.

***

### start

> `readonly` **start**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:70](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L70)

Start timestamp.

***

### tick

> `readonly` **tick**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:74](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L74)

Midnight tick.
