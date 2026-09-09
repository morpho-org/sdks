[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [EcrecoverRatifierUtils](../README.md) / sign

# Function: sign()

> **sign**(`params`): `Promise`\<`` `0x${string}` ``\>

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:865](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L865)

Signs EcrecoverRatifier typed data through a viem client.

Use when app code wants the signature separately from payload item
construction. If you only need payload items, call `ratify` with the same
client and account. The account may be the maker or an address authorized
by every maker in the tree; the protocol checks that authorization onchain.

## Parameters

### params

#### account

`` `0x${string}` `` \| `Account`

Account used to sign the tree typed data.

#### client

`Client`\<`Transport`, `Chain`, `Account` \| `undefined`\>

Viem client whose transport signs the tree typed data.

#### tree

[`RatifierTreeInput`](../../../type-aliases/RatifierTreeInput.md)

Ecrecover-ratified offer tree-like input to sign.

## Returns

`Promise`\<`` `0x${string}` ``\>

Signature returned by the client.

## Throws

when the tree is invalid, contains multiple ratifiers, or spans multiple chain ids.

## Throws

when the tree height is unsupported.

## Throws

when `params.client.chain?.id` does not match the tree offer chain id.

## Throws

when the returned signature does not recover to `params.account`.

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

const signature = await EcrecoverRatifierUtils.sign({
  tree: Tree.create([offer]),
  client,
  account: offer.maker,
});
console.log(signature);
```
