[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / getConsumableUnits

# Function: getConsumableUnits()

> **getConsumableUnits**(`params`): `bigint`

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:979](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L979)

Returns remaining units accepted by an offer's cap at a timestamp.

The offer must carry a hydrated [Market](../../../classes/Market.md) so the current market
continuous fee and settlement-fee buckets are available locally. Fetch the
current `consumed(maker, group)` value separately and pass it as input.

## Parameters

### params

#### consumed

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Amount already consumed from the offer group.

#### offer

`Pick`\<[`IOffer`](../../../interfaces/IOffer.md), `"market"` \| `"buy"` \| `"start"` \| `"expiry"` \| `"tick"` \| `"maxUnits"` \| `"maxAssets"` \| `"continuousFeeCap"`\>

Offer to inspect. Its market must be hydrated.

#### timestamp

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Timestamp used to compute market time to maturity.

## Returns

`bigint`

Remaining consumable units accepted by Midnight `take`.

## Throws

when the offer does not carry hydrated market state or has invalid caps.

## Throws

when `consumed`, `timestamp`, offer limits, or delegated math inputs are negative.

## Throws

when `tick` exceeds `MAX_TICK`.

## Throws

when settlement fee exceeds a buy-offer price.

## Example

```ts
import { OfferUtils, midnightAbi } from "@morpho-org/midnight-sdk";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { readContract } from "viem/actions";

const client = createPublicClient({ chain: base, transport: http() });
const offer = {
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
} as const;
const consumed = await readContract(client, {
  address: "0x0000000000000000000000000000000000001000",
  abi: midnightAbi,
  functionName: "consumed",
  args: [offer.maker, "0x1111111111111111111111111111111111111111111111111111111111111111"],
});
const units = OfferUtils.getConsumableUnits({ offer, consumed, timestamp: 1_000n });
console.log(units);
```
