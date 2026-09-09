[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [EcrecoverRatifierUtils](../README.md) / digestRatifierData

# Function: digestRatifierData()

> **digestRatifierData**(`params`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:726](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L726)

Builds the EcrecoverRatifier digest from one payload item's encoded ratifier data.

## Parameters

### params

[`EcrecoverRatifierDataDigestParams`](../../../interfaces/EcrecoverRatifierDataDigestParams.md)

## Returns

`` `0x${string}` ``

EIP-712 digest signed by the maker or authorized signer.

## Throws

when `params.chainId` does not match `offer.market.chainId`.

## Throws

when the proof height exceeds 20.

## Example

```ts
import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";

const digest = EcrecoverRatifierUtils.digestRatifierData({
  chainId: 8453n,
  offer,
  ratifierData,
});
console.log(digest);
```
