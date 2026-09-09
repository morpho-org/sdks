[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / EcrecoverRatifierRatifyParams

# Type Alias: EcrecoverRatifierRatifyParams

> **EcrecoverRatifierRatifyParams** = \{ `account`: `Account` \| `Address`; `client`: `Client`\<`Transport`, `Chain`, `Account` \| `undefined`\>; `signature?`: `undefined`; `tree`: [`RatifierTreeInput`](RatifierTreeInput.md); \} \| \{ `account`: `Account` \| `Address`; `chainId?`: `undefined`; `client?`: `undefined`; `signature`: [`EcrecoverSignatureInput`](EcrecoverSignatureInput.md); `tree`: [`RatifierTreeInput`](RatifierTreeInput.md); \}

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:346](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L346)

Parameters for [EcrecoverRatifierUtils.ratify](../namespaces/EcrecoverRatifierUtils/functions/ratify.md).

Use this after tree validation. Provide either a signing client plus account
or a precomputed signature plus the account that produced it.

## Union Members

### Type Literal

\{ `account`: `Account` \| `Address`; `client`: `Client`\<`Transport`, `Chain`, `Account` \| `undefined`\>; `signature?`: `undefined`; `tree`: [`RatifierTreeInput`](RatifierTreeInput.md); \}

#### account

> `readonly` **account**: `Account` \| `Address`

Account that signs the tree root. It may be the maker or an address authorized by each maker.

#### client

> `readonly` **client**: `Client`\<`Transport`, `Chain`, `Account` \| `undefined`\>

Viem client whose transport signs the typed data built from `tree`.

#### signature?

> `readonly` `optional` **signature?**: `undefined`

Omit when the SDK should request the signature through `client`.

#### tree

> `readonly` **tree**: [`RatifierTreeInput`](RatifierTreeInput.md)

Tree-like input being ratified.

***

### Type Literal

\{ `account`: `Account` \| `Address`; `chainId?`: `undefined`; `client?`: `undefined`; `signature`: [`EcrecoverSignatureInput`](EcrecoverSignatureInput.md); `tree`: [`RatifierTreeInput`](RatifierTreeInput.md); \}

#### account

> `readonly` **account**: `Account` \| `Address`

Account that produced the signature. It may be the maker or an address authorized by each maker.

#### chainId?

> `readonly` `optional` **chainId?**: `undefined`

Omit when a precomputed signature is supplied.

#### client?

> `readonly` `optional` **client?**: `undefined`

Omit when a precomputed signature is supplied.

#### signature

> `readonly` **signature**: [`EcrecoverSignatureInput`](EcrecoverSignatureInput.md)

Precomputed signature for this tree root.

#### tree

> `readonly` **tree**: [`RatifierTreeInput`](RatifierTreeInput.md)

Tree-like input being ratified.

## Example

```ts
import { Offer, Tree, type EcrecoverRatifierRatifyParams } from "@morpho-org/midnight-sdk";
import { zeroAddress, zeroHash } from "viem";

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
const params: EcrecoverRatifierRatifyParams = {
  tree: Tree.create([offer]),
  account: "0x0000000000000000000000000000000000009000",
  signature: { v: 27, r: zeroHash, s: zeroHash },
};
console.log(params.tree);
```
