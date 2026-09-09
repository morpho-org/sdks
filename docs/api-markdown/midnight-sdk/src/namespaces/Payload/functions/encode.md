[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [Payload](../README.md) / encode

# Function: encode()

> **encode**(`items`): `Promise`\<`` `0x${string}` ``\>

Defined in: [packages/midnight-sdk/src/signatures/Payload.ts:314](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Payload.ts#L314)

ABI-encode `items` as `(Offer, bytes ratifierData)[]` and gzip the result,
then emit the wire payload `version || uint32(gzipLen) || gzip(...)`. The
single-byte version prefix lets future formats coexist on the wire; the
4-byte big-endian length delimits the gzip stream so `decode` finds its end
without scanning. That delimiter is what lets a publisher append a small
opaque suffix (e.g. an attribution tag) after the gzip stream — `decode`
ignores up to `MAX_ATTRIBUTION_SUFFIX_BYTES` bytes past `gzipLen` and rejects
a larger suffix. Item order is preserved verbatim and is the order a consumer
sees on decode.

Use after ratifier utilities have produced payload-ready items and before an
onchain mempool submission. Normal SDK maker flows should validate the tree
with `Tree.mempoolValidate` before ratification; use
`MidnightApi.validateMempoolPayload` only when validating already encoded
payload bytes.

## Parameters

### items

readonly [`Item`](../type-aliases/Item.md)[]

Per-leaf items in the order the maker committed to. Must
  contain at least one item and fit within payload byte-size limits.

## Returns

`Promise`\<`` `0x${string}` ``\>

The encoded payload as a `Hex` string, ready to include in onchain
  mempool submission calldata.

## Throws

when the item list is empty, encoding or compression
  exceeds SDK byte-size limits, or a non-empty offer fails payload validation
  for collateral requirements, maturity timing, expiry range, tick bounds, or
  `maxUnits`/`maxAssets` cap shape.

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
console.log(encoded);
```
