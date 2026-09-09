[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [EcrecoverRatifierUtils](../README.md) / ratify

# Function: ratify()

> **ratify**(`params`): `Promise`\<readonly [`Item`](../../Payload/type-aliases/Item.md)[]\>

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:1179](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L1179)

Signs or consumes a tree signature and returns payload-ready items.

Use after `Tree.mempoolValidate` and before `Payload.encode`.
The returned items preserve tree leaf order and include ratifier data
required by takers. The group id is stored on each inline offer.

## Parameters

### params

[`EcrecoverRatifierRatifyParams`](../../../type-aliases/EcrecoverRatifierRatifyParams.md)

## Returns

`Promise`\<readonly [`Item`](../../Payload/type-aliases/Item.md)[]\>

Items containing each offer and its ratifier data.

## Throws

when the tree is invalid or contains multiple ratifiers.

## Throws

when the tree height is unsupported.

## Throws

when client signing or a precomputed signature does not recover to `params.account`.

## Example

```ts
import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
import { Offer } from "@morpho-org/midnight-sdk";
import { createWalletClient, http, zeroAddress } from "viem";
import { base } from "viem/chains";

const offer = Offer.create({
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
  tick: 5_000n,
  expiry: 3_600n,
  ratifier: "0x0000000000000000000000000000000000004000",
  maxUnits: 100n,
});
const client = createWalletClient({
  chain: base,
  transport: http(),
});

const items = await EcrecoverRatifierUtils.ratify({
  tree: Tree.create([offer]),
  client,
  account: offer.maker,
});
console.log(items.length);
```
