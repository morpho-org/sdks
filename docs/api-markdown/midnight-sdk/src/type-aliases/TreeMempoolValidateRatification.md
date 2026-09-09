[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / TreeMempoolValidateRatification

# Type Alias: TreeMempoolValidateRatification

> **TreeMempoolValidateRatification** = \{ `account`: `Account` \| `Address`; `client`: `Client`\<`Transport`, `Chain`, `Account` \| `undefined`\>; `signature?`: `undefined`; `type`: `"ecrecover"`; \} \| \{ `account`: `Account` \| `Address`; `client?`: `undefined`; `signature`: [`EcrecoverSignatureInput`](EcrecoverSignatureInput.md); `type`: `"ecrecover"`; \} \| \{ `type`: `"setter"`; \}

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:392](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L392)

Optional ratification inputs for [Tree.mempoolValidate](../classes/Tree.md#mempoolvalidate).

Omit this when validating offer policy before the maker signs or approves a
tree. Provide it when validating the final payload shape, including real
`ratifierData`, after the Ecrecover signature and signer address exist or the
Setter root is ready for publication.

## Union Members

### Type Literal

\{ `account`: `Account` \| `Address`; `client`: `Client`\<`Transport`, `Chain`, `Account` \| `undefined`\>; `signature?`: `undefined`; `type`: `"ecrecover"`; \}

#### account

> `readonly` **account**: `Account` \| `Address`

Account that signs the tree root.

#### client

> `readonly` **client**: `Client`\<`Transport`, `Chain`, `Account` \| `undefined`\>

Viem client whose transport signs typed data built from the tree.

#### signature?

> `readonly` `optional` **signature?**: `undefined`

Omit when the SDK should request the signature through `client`.

#### type

> `readonly` **type**: `"ecrecover"`

Ecrecover ratifier route.

***

### Type Literal

\{ `account`: `Account` \| `Address`; `client?`: `undefined`; `signature`: [`EcrecoverSignatureInput`](EcrecoverSignatureInput.md); `type`: `"ecrecover"`; \}

#### account

> `readonly` **account**: `Account` \| `Address`

Account that produced the signature. It may be the maker or an address authorized by each maker.

#### client?

> `readonly` `optional` **client?**: `undefined`

Omit when a precomputed signature is supplied.

#### signature

> `readonly` **signature**: [`EcrecoverSignatureInput`](EcrecoverSignatureInput.md)

Precomputed signature for this tree root.

#### type

> `readonly` **type**: `"ecrecover"`

Ecrecover ratifier route.

***

### Type Literal

\{ `type`: `"setter"`; \}

#### type

> `readonly` **type**: `"setter"`

Setter ratifier route.

## Example

```ts
import { zeroHash, type Signature } from "viem";
import type { TreeMempoolValidateRatification } from "@morpho-org/midnight-sdk";

const ratification: TreeMempoolValidateRatification = {
  type: "ecrecover",
  account: "0x0000000000000000000000000000000000009000",
  signature: { v: 27, r: zeroHash, s: zeroHash } satisfies Signature,
};
console.log(ratification.type);
```
