[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / fetchRatifierInfo

# Function: fetchRatifierInfo()

> **fetchRatifierInfo**(`client`, `params`): `Promise`\<[`RatifierInfo`](../interfaces/RatifierInfo.md)\>

Defined in: [packages/midnight-sdk/src/fetch/Ratifier.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/Ratifier.ts#L43)

Fetches maker bytecode and classifies the ratifier route for new offers.

The `bytecode` read is the result of `eth_getCode` for `params.maker` at the
requested block. It is not returned to callers; it only tells the SDK whether
the maker is an EOA or EIP-7702 account that can use Ecrecover signatures, or
a deployed-code account that should use Setter root approval. Put the returned
`ratifier` address on `Offer.create`, then use the returned `type` to choose
`EcrecoverRatifierUtils.ratify` or `SetterRatifierUtils.ratify` after the tree
has been built.

Reads `eth_chainId` only when the viem client has no configured chain id,
then reads `eth_getCode` for `params.maker`.

## Parameters

### client

`Client`

Viem client used for the bytecode read.

### params

`object` & [`MidnightCallParameters`](../interfaces/MidnightCallParameters.md)

## Returns

`Promise`\<[`RatifierInfo`](../interfaces/RatifierInfo.md)\>

Ratifier information.

## Throws

when no address registry exists for the client chain id.

## Throws

when the registry has no configured ratifier address for the client chain id.

## Example

```ts
import { fetchRatifierInfo } from "@morpho-org/midnight-sdk";

const maker = "0x7b093658BE7f90B63D7c359e8f408e503c2D9401";
const info = await fetchRatifierInfo(client, { maker });
// Pass info.ratifier to Offer.create(...), then use info.type after
// Tree.create([...]) to choose the Ecrecover or Setter ratifier flow.
console.log(info.type, info.ratifier);
```
