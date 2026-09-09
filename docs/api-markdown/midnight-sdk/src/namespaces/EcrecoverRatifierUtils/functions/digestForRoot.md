[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [EcrecoverRatifierUtils](../README.md) / digestForRoot

# Function: digestForRoot()

> **digestForRoot**(`params`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:679](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L679)

Builds the EcrecoverRatifier digest from a payload offer, root, and proof height.

Use this on the take-side or in indexers after decoding ratifier data, when
the original full tree is not available but the payload item includes the
offer and proof metadata needed to reconstruct the signed digest. Pass the
observed log or execution chain id so cross-chain-spoofed payloads are
rejected before signature recovery.

## Parameters

### params

[`EcrecoverRatifierRootDigestParams`](../../../interfaces/EcrecoverRatifierRootDigestParams.md)

## Returns

`` `0x${string}` ``

EIP-712 digest signed by the maker or authorized signer.

## Throws

when `params.chainId` does not match `offer.market.chainId`.

## Throws

when `proofLength` exceeds 20.

## Example

```ts
import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
import { zeroHash } from "viem";

const digest = EcrecoverRatifierUtils.digestForRoot({
  chainId: 8453n,
  offer,
  root: zeroHash,
  proofLength: 0,
});
console.log(digest);
```
