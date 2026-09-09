[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [EcrecoverRatifierUtils](../README.md) / verifyRatifierData

# Function: verifyRatifierData()

> **verifyRatifierData**(`params`): `Promise`\<[`VerifiedEcrecoverRatifierData`](../../../interfaces/VerifiedEcrecoverRatifierData.md)\>

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:768](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L768)

Verifies an Ecrecover ratifier-data proof and recovers its signer.

This helper intentionally does not check `Midnight.isAuthorized` or
`EcrecoverRatifier.isRootCanceled` state. Consumers must query both at the
observed block before treating a recovered item as executable: the returned
signer must be the maker or authorized by the maker, the offer ratifier must
be authorized by the maker, and `isRootCanceled(maker, root)` must be false.

## Parameters

### params

[`EcrecoverRatifierDataVerificationParams`](../../../interfaces/EcrecoverRatifierDataVerificationParams.md)

## Returns

`Promise`\<[`VerifiedEcrecoverRatifierData`](../../../interfaces/VerifiedEcrecoverRatifierData.md)\>

Decoded ratifier data plus recovered signer.

## Throws

when `params.chainId` does not match `offer.market.chainId`.

## Throws

when the decoded signature `v` is not 27 or 28.

## Throws

when the proof does not include `offer` in `root`.

## Throws

when the proof height exceeds 20.

## Example

```ts
import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";

const verified = await EcrecoverRatifierUtils.verifyRatifierData({
  chainId: 8453n,
  offer,
  ratifierData,
});
console.log(verified.signer);
```
