[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [Payload](../README.md) / decode

# Function: decode()

> **decode**(`payload`, `options?`): `Promise`\<[`Item`](../type-aliases/Item.md)[]\>

Defined in: [packages/midnight-sdk/src/signatures/Payload.ts:394](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Payload.ts#L394)

Parse a wire payload back into its `(offer, ratifierData)` items. The version
byte is validated against `CURRENT_VERSION` and not surfaced — any payload
that decodes successfully is on the current wire format. The 4-byte length
prefix bounds the gzip stream; up to `MAX_ATTRIBUTION_SUFFIX_BYTES` bytes
after it (e.g. an attribution suffix appended by the publishing app) are
ignored, so a tagged payload decodes identically to an untagged one. A larger
trailing suffix is rejected so an oversized blob cannot ride a small payload
past validation and into the indexer.

Use on the take-side, in indexers, or in diagnostics when you need to inspect
the offer structs and ratifier data that a maker published.

## Parameters

### payload

`` `0x${string}` ``

Hex payload bytes to decode.

### options?

[`DecodeOptions`](../type-aliases/DecodeOptions.md)

Optional decode bounds.

## Returns

`Promise`\<[`Item`](../type-aliases/Item.md)[]\>

The decoded items in encoded order.

## Throws

when the payload is malformed or exceeds protocol limits.

## Example

```ts
import { Offer, Payload } from "@morpho-org/midnight-sdk";
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
const encoded = await Payload.encode([{ offer, ratifierData: "0x" }]);
const items = await Payload.decode(encoded);
console.log(items.length);
```
