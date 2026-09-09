[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / midnightCancelOffer

# Function: midnightCancelOffer()

> **midnightCancelOffer**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightCancelOfferAction`](../interfaces/MidnightCancelOfferAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/midnight/cancelOffer.ts:51](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/cancelOffer.ts#L51)

Encodes `Midnight.setConsumed` to cancel or partially consume an offer group.

App flows should usually call `client.morpho.midnight(chainId).cancelOffer(...)`.
Use this builder directly when the group id is already known and no
additional requirements are needed. Omitting `amount` fully cancels the group
by setting consumption to [MAX\_OFFER\_CAP](../../../midnight-sdk/src/variables/MAX_OFFER_CAP.md).

## Parameters

### params

[`MidnightCancelOfferParams`](../interfaces/MidnightCancelOfferParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MidnightCancelOfferAction`](../interfaces/MidnightCancelOfferAction.md)\>\>

A deep-frozen `Transaction<MidnightCancelOfferAction>` targeting `Midnight`.

## Throws

when `amount` is negative.

## Throws

when `amount` exceeds [MAX\_OFFER\_CAP](../../../midnight-sdk/src/variables/MAX_OFFER_CAP.md).

## Example

```ts
import { midnightCancelOffer } from "@morpho-org/morpho-sdk";

const tx = midnightCancelOffer({
  chainId: 8453,
  group,
  onBehalf: maker,
});
```
