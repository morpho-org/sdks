[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / Tree

# Class: Tree

Defined in: [packages/midnight-sdk/src/signatures/Tree.ts:67](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Tree.ts#L67)

Maker-side Merkle tree used by Midnight ratifiers.

Build a tree after offers have been created and related offers have been
grouped. The tree root is what Ecrecover makers sign, Setter makers approve,
and payload items later prove with per-leaf ratifier data.

## Example

```ts
import { Offer, Tree } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

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
const tree = Tree.create([offer]);
console.log(tree.root);
```

## Properties

### height

> `readonly` **height**: `number`

Defined in: [packages/midnight-sdk/src/signatures/Tree.ts:81](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Tree.ts#L81)

Tree height.

***

### leaves

> `readonly` **leaves**: readonly `` `0x${string}` ``[]

Defined in: [packages/midnight-sdk/src/signatures/Tree.ts:75](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Tree.ts#L75)

Leaf hashes for `paddedOffers`.

***

### offers

> `readonly` **offers**: readonly [`Offer`](Offer.md)[]

Defined in: [packages/midnight-sdk/src/signatures/Tree.ts:69](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Tree.ts#L69)

Non-padding offers in leaf order.

***

### paddedOffers

> `readonly` **paddedOffers**: readonly [`OfferStruct`](../interfaces/OfferStruct.md)[]

Defined in: [packages/midnight-sdk/src/signatures/Tree.ts:72](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Tree.ts#L72)

ABI-compatible offers in leaf order, including protocol-zero padding.

***

### root

> `readonly` **root**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/Tree.ts:78](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Tree.ts#L78)

Merkle root.

## Methods

### mempoolValidate()

> **mempoolValidate**(`params`): `Promise`\<`MempoolPayloadValidationSuccess`\>

Defined in: [packages/midnight-sdk/src/signatures/Tree.ts:258](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Tree.ts#L258)

Validates this tree against Midnight mempool API policy.

This is an API-backed convenience: by default it encodes each tree leaf
with empty `ratifierData`, then sends the temporary payload to the Midnight
API `POST /mempool/validate` endpoint. Pass `ratification` after signing or
Setter root preparation to validate final payload bytes with real
`ratifierData`.

#### Parameters

##### params

[`TreeMempoolValidateParams`](../interfaces/TreeMempoolValidateParams.md)

#### Returns

`Promise`\<`MempoolPayloadValidationSuccess`\>

Successful API validation result with `valid: true`.

#### Throws

when validation payload encoding fails.

#### Throws

when the API returns a non-2xx response.

#### Throws

when the API returns malformed success JSON.

#### Throws

when the API returns validation issues.

#### Example

```ts
import { Offer, Tree } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

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
await Tree.create([offer]).mempoolValidate({
  chainId: 8453,
});
```

***

### proof()

> **proof**(`leafIndex`): [`TreeProof`](../interfaces/TreeProof.md)

Defined in: [packages/midnight-sdk/src/signatures/Tree.ts:310](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Tree.ts#L310)

Builds a Merkle proof for one leaf.

Ratifier utilities call this when building per-offer `ratifierData`. Use it
directly only for custom ratifiers or local proof inspection.

#### Parameters

##### leafIndex

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Leaf index to prove.

#### Returns

[`TreeProof`](../interfaces/TreeProof.md)

Tree proof.

#### Throws

when the leaf index is out of range.

#### Example

```ts
import { Offer, Tree } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

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
const proof = Tree.create([offer]).proof(0n);
console.log(proof.root);
```

***

### create()

> `static` **create**(`params`): `Tree`

Defined in: [packages/midnight-sdk/src/signatures/Tree.ts:199](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Tree.ts#L199)

Creates a tree from groups or standalone offers.

Use after `Offer.create` and optional `Group.create`, before
`Tree.mempoolValidate`, `EcrecoverRatifierUtils.ratify`, or
`SetterRatifierUtils.ratify`. Groups are flattened, and every standalone
offer is normalized as a singleton group using the router-compatible group
id algorithm.

#### Parameters

##### params

[`TreeCreateParams`](../type-aliases/TreeCreateParams.md)

Groups or standalone offers in leaf order.

#### Returns

`Tree`

Tree instance.

#### Throws

when the tree is empty, all padding, or duplicated.

#### Throws

when the resulting height is unsupported.

#### Example

```ts
import { Offer, Tree } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

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
const tree = Tree.create([offer]);
console.log(tree.height);
```

***

### from()

> `static` **from**(`tree`): `Tree`

Defined in: [packages/midnight-sdk/src/signatures/Tree.ts:147](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Tree.ts#L147)

Returns a tree instance from class or plain input.

Use at boundaries that accept either a prebuilt tree or raw group/offer
inputs, such as API validation helpers. Existing `Tree` instances are
returned as-is.

#### Parameters

##### tree

[`TreeInput`](../type-aliases/TreeInput.md)

Tree class or creation input.

#### Returns

`Tree`

Tree instance.

#### Throws

when the tree is empty, all padding, or duplicated.

#### Throws

when the resulting height is unsupported.

#### Example

```ts
import { Offer, Tree } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

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
const tree = Tree.from([offer]);
console.log(tree.root);
```
