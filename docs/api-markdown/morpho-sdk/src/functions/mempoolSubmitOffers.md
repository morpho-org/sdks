[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / mempoolSubmitOffers

# Function: mempoolSubmitOffers()

> **mempoolSubmitOffers**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MempoolSubmitOffersAction`](../interfaces/MempoolSubmitOffersAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts:61](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/mempoolSubmitOffers.ts#L61)

Encodes a Midnight mempool payload submission transaction.

App make-offer flows should call `getOffersData`, gather the returned
requirements, then call the output `buildTx(signatures)`. Use this builder
directly only when the payload has already been encoded with ratifier data
and the caller wants to submit those bytes to the mempool contract.

## Parameters

### params

[`MempoolSubmitOffersParams`](../interfaces/MempoolSubmitOffersParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`MempoolSubmitOffersAction`](../interfaces/MempoolSubmitOffersAction.md)\>\>

A deep-frozen `Transaction<MempoolSubmitOffersAction>` targeting `MidnightMempool`.

## Throws

when `offers <= 0`.

## Example

```ts
import { MidnightPayload } from "@morpho-org/morpho-sdk/utils";
import { mempoolSubmitOffers } from "@morpho-org/morpho-sdk";

const payload = await MidnightPayload.encode(items);
const tx = mempoolSubmitOffers({
  chainId: 8453,
  groups,
  root: tree.root,
  maker,
  ratifier,
  ratifierType: "ecrecover",
  offers: tree.offers.length,
  payload,
});
```
