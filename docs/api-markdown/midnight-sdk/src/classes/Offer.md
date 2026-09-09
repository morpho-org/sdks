[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / Offer

# Class: Offer

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:147](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L147)

Maker-side Midnight offer.

Build new maker offers with [Offer.create](#create), then pass them to
`Group.create` for shared-consumption ladders or directly to `Tree.create`
for standalone offers. API/take-side code can convert a plain `IOffer`
into this class before ABI encoding. The class resolves the onchain `group`
field lazily. Standalone offers derive their content-addressed singleton
group id from the offer's zero-group hash; `Group.create` copies offers and
overrides the group on those copies when several offers share one
consumption bucket. Offers hydrated from API or decoded data may also carry
a known group id.

## Example

```ts
import { Offer } from "@morpho-org/midnight-sdk";

const offer = Offer.create({
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
  buy: false,
  maker: "0x0000000000000000000000000000000000000002",
  start: 0n,
  expiry: 2n,
  tick: 100n,
  callback: "0x0000000000000000000000000000000000000000",
  callbackData: "0x",
  receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000002",
  ratifier: "0x0000000000000000000000000000000000000003",
  reduceOnly: false,
  maxUnits: 100n,
  maxAssets: 0n,
  continuousFeeCap: 317097919n,
});
console.log(offer.buy);
```

## Constructors

### Constructor

> **new Offer**(`offer`): `Offer`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:194](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L194)

#### Parameters

##### offer

[`IOffer`](../interfaces/IOffer.md)

#### Returns

`Offer`

## Properties

### buy

> `readonly` **buy**: `boolean`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:152](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L152)

Whether the maker buys units.

***

### callback

> `readonly` **callback**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:171](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L171)

Optional maker callback.

***

### callbackData

> `readonly` **callbackData**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:174](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L174)

Callback payload.

***

### continuousFeeCap

> `readonly` **continuousFeeCap**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:192](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L192)

Maximum market continuous fee accepted by this offer.

***

### expiry

> `readonly` **expiry**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:161](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L161)

Expiry timestamp.

***

### maker

> `readonly` **maker**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:155](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L155)

Offer maker.

***

### market

> `readonly` **market**: [`MarketParams`](MarketParams.md) \| [`Market`](Market.md)

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:149](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L149)

Market this offer trades.

***

### maxAssets

> `readonly` **maxAssets**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:189](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L189)

Maximum buyer or seller assets, depending on side.

***

### maxUnits

> `readonly` **maxUnits**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:186](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L186)

Maximum units; zero means max assets controls consumption.

***

### ratifier

> `readonly` **ratifier**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:180](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L180)

Ratifier contract.

***

### receiverIfMakerIsSeller

> `readonly` **receiverIfMakerIsSeller**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:177](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L177)

Receiver used when maker is seller.

***

### reduceOnly

> `readonly` **reduceOnly**: `boolean`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:183](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L183)

Whether the offer can only reduce maker exposure.

***

### start

> `readonly` **start**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:158](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L158)

Start timestamp.

***

### tick

> `readonly` **tick**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:164](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L164)

Midnight tick.

## Accessors

### group

#### Get Signature

> **get** **group**(): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:320](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L320)

Consumption group id encoded into this offer.

When no group id was provided, the value is computed on first access by
hashing this offer with the protocol zero group id, then hashing that
result as a singleton group. The computed value is cached because offer
hashing is resource-intensive. This is equivalent to
`GroupUtils.hash([offer])`, but is computed directly to keep the offers
layer from importing signature helpers and creating a circular dependency.

##### Example

```ts
import { Offer } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

const loanToken = "0x0000000000000000000000000000000000006000";
const collateralToken = "0x0000000000000000000000000000000000007000";
const oracle = "0x0000000000000000000000000000000000008000";
const maker = "0x0000000000000000000000000000000000009000";
const ratifier = "0x0000000000000000000000000000000000004000";

const offer = Offer.create({
  market: {
    chainId: 8453,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken,
    collateralParams: [
      {
        token: collateralToken,
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle,
      },
    ],
    maturity: 2_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  buy: true,
  maker,
  tick: 5_000n,
  expiry: 2_100n,
  ratifier,
  maxAssets: 100n,
});

const group = offer.group;
console.log(group);
```

##### Returns

`` `0x${string}` ``

Consumption group id.

***

### hash

#### Get Signature

> **get** **hash**(): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:373](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L373)

Canonical protocol offer hash for this offer.

The hash includes [Offer.group](#group). It is computed lazily and cached
because hashing includes market hashing and ABI encoding.

##### Example

```ts
import { Offer } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

const loanToken = "0x0000000000000000000000000000000000006000";
const collateralToken = "0x0000000000000000000000000000000000007000";
const oracle = "0x0000000000000000000000000000000000008000";
const maker = "0x0000000000000000000000000000000000009000";
const ratifier = "0x0000000000000000000000000000000000004000";

const offer = Offer.create({
  market: {
    chainId: 8453,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken,
    collateralParams: [
      {
        token: collateralToken,
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle,
      },
    ],
    maturity: 2_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  buy: true,
  maker,
  tick: 5_000n,
  expiry: 2_100n,
  ratifier,
  maxAssets: 100n,
});

const hash = offer.hash;
// hash satisfies Hash
```

##### Returns

`` `0x${string}` ``

Offer hash.

***

### price

#### Get Signature

> **get** **price**(): `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:414](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L414)

WAD zero-coupon price at this offer's tick.

##### Throws

when `tick` is negative.

##### Throws

when `tick` exceeds `MAX_TICK`.

##### Example

```ts
import { Offer } from "@morpho-org/midnight-sdk";

const offer = Offer.create({
  market: {
    loanToken: "0x0000000000000000000000000000000000006000",
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000007000",
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity: 54_000n,
    rcfThreshold: 0n,
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  tick: 5_000n,
  expiry: 3_600n,
  ratifier: "0x0000000000000000000000000000000000004000",
  maxUnits: 100n,
});
console.log(offer.price);
```

##### Returns

`bigint`

WAD price rounded to the protocol price quantum.

## Methods

### getApr()

> **getApr**(`timestamp`): `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:500](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L500)

Converts this offer's tick into a WAD simple annual percentage rate at a timestamp.

#### Parameters

##### timestamp

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Timestamp at which the APR is calculated.

#### Returns

`bigint`

WAD simple APR rounded up.

#### Throws

when market maturity, `timestamp`, or `tick` is negative.

#### Throws

when `tick` exceeds `MAX_TICK`.

#### Throws

when the tick price is zero or `timestamp` is at or after maturity.

#### Example

```ts
import { Offer } from "@morpho-org/midnight-sdk";

const offer = Offer.create({
  market: {
    loanToken: "0x0000000000000000000000000000000000006000",
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000007000",
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity: 54_000n,
    rcfThreshold: 0n,
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  tick: 5_000n,
  expiry: 3_600n,
  ratifier: "0x0000000000000000000000000000000000004000",
  maxUnits: 100n,
});
const apr = offer.getApr(1_000n);
console.log(apr);
```

***

### getConsumableUnits()

> **getConsumableUnits**(`params`): `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:573](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L573)

Returns remaining units accepted by this offer's cap at a timestamp.

The offer must carry a hydrated [Market](Market.md) so the current market
continuous fee and settlement-fee buckets are available locally. Fetch the
current `consumed(maker, group)` value separately and pass it as input.

#### Parameters

##### params

###### consumed

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Amount already consumed from this offer's group.

###### timestamp

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Timestamp used to compute the market time to maturity.

#### Returns

`bigint`

Remaining consumable units accepted by Midnight `take`.

#### Throws

when this offer does not carry hydrated market state or has invalid caps.

#### Throws

when `consumed`, `timestamp`, offer limits, or delegated math inputs are negative.

#### Throws

when `tick` exceeds `MAX_TICK`.

#### Throws

when settlement fee exceeds a buy-offer price.

#### Example

```ts
import { Offer } from "@morpho-org/midnight-sdk";

const offer = Offer.from({
  market: {
    params: {
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
      maturity: 54_000n,
      rcfThreshold: 0n,
      enterGate: "0x0000000000000000000000000000000000000000",
      liquidatorGate: "0x0000000000000000000000000000000000000000",
    },
    totalUnits: 1_000n,
    lossFactor: 0n,
    withdrawable: 500n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
    continuousFee: 10,
    tickSpacing: 4,
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  start: 0n,
  expiry: 3_600n,
  tick: 5_000n,
  callback: "0x0000000000000000000000000000000000000000",
  callbackData: "0x",
  receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
  ratifier: "0x0000000000000000000000000000000000004000",
  reduceOnly: false,
  maxUnits: 100n,
  maxAssets: 0n,
  continuousFeeCap: 317097919n,
});
const consumed = await readContract(client, {
  address: "0x0000000000000000000000000000000000001000",
  abi: midnightAbi,
  functionName: "consumed",
  args: [offer.maker, offer.group],
});
const units = offer.getConsumableUnits({ consumed, timestamp: 1_000n });
console.log(units);
```

***

### getRate()

> **getRate**(`timestamp`): `bigint`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:457](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L457)

Converts this offer's tick into a WAD per-second simple rate at a timestamp.

#### Parameters

##### timestamp

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Timestamp at which the rate is calculated.

#### Returns

`bigint`

WAD per-second simple rate rounded up.

#### Throws

when market maturity, `timestamp`, or `tick` is negative.

#### Throws

when `tick` exceeds `MAX_TICK`.

#### Throws

when the tick price is zero or `timestamp` is at or after maturity.

#### Example

```ts
import { Offer } from "@morpho-org/midnight-sdk";

const offer = Offer.create({
  market: {
    loanToken: "0x0000000000000000000000000000000000006000",
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000007000",
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity: 54_000n,
    rcfThreshold: 0n,
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  tick: 5_000n,
  expiry: 3_600n,
  ratifier: "0x0000000000000000000000000000000000004000",
  maxUnits: 100n,
});
const rate = offer.getRate(1_000n);
console.log(rate);
```

***

### create()

> `static` **create**(`params`): `Offer`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:649](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L649)

Creates a validated maker-side Midnight offer.

This is the first step of the make-side flow. After creation, pass related
offers to `Group.create` when they share consumption, or pass standalone
offers directly to `Tree.create`. Omit `group` for brand-new maker offers;
provide it when hydrating an offer that already has a protocol group, such
as an offer decoded from the API.

#### Parameters

##### params

[`BuildOfferParams`](../interfaces/BuildOfferParams.md)

#### Returns

`Offer`

Offer instance.

#### Throws

when the offer cannot satisfy protocol parameter rules.

#### Example

```ts
import { Offer } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

const loanToken = "0x0000000000000000000000000000000000006000";
const collateralToken = "0x0000000000000000000000000000000000007000";
const oracle = "0x0000000000000000000000000000000000008000";
const maker = "0x0000000000000000000000000000000000009000";
const ratifier = "0x0000000000000000000000000000000000004000";
const apiGroup =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

const offer = Offer.create({
  market: {
    chainId: 8453,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken,
    collateralParams: [
      {
        token: collateralToken,
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle,
      },
    ],
    maturity: 2_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  buy: true,
  maker,
  tick: 5_000n,
  group: apiGroup,
  expiry: 2_100n,
  ratifier,
  maxAssets: 100n,
});
// offer satisfies Offer
```

***

### from()

> `static` **from**(`offer`): `Offer`

Defined in: [packages/midnight-sdk/src/offers/Offer.ts:264](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/Offer.ts#L264)

Returns an offer instance from class or plain input.

Use at boundaries that accept either maker-created `Offer` instances or
decoded `IOffer` objects from an API response. For brand-new maker input,
prefer [Offer.create](#create) so deterministic parameters are validated first.

#### Parameters

##### offer

[`IOffer`](../interfaces/IOffer.md)

Offer class or plain input.

#### Returns

`Offer`

Offer instance.

#### Example

```ts
import { Offer } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

const offer = Offer.from({
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
    maturity: 54_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  start: 0n,
  expiry: 3_600n,
  tick: 5_000n,
  callback: zeroAddress,
  callbackData: "0x",
  receiverIfMakerIsSeller: zeroAddress,
  ratifier: "0x0000000000000000000000000000000000004000",
  reduceOnly: false,
  maxUnits: 100n,
  maxAssets: 0n,
  continuousFeeCap: 317097919n,
});
console.log(offer.buy);
```
