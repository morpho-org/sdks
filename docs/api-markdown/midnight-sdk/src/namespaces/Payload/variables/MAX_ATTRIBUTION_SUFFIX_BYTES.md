[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [Payload](../README.md) / MAX\_ATTRIBUTION\_SUFFIX\_BYTES

# Variable: MAX\_ATTRIBUTION\_SUFFIX\_BYTES

> `const` **MAX\_ATTRIBUTION\_SUFFIX\_BYTES**: `256` = `256`

Defined in: [packages/midnight-sdk/src/signatures/Payload.ts:115](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Payload.ts#L115)

Upper bound on opaque bytes appended after the gzip stream (e.g. an app
attribution tag). The suffix is meant to be small, so `decode` rejects a
larger one: this keeps the `MAX_PAYLOAD_BYTES` ceiling meaningful for the
whole input. Without it a tiny declared `gzipLen` could smuggle an
arbitrarily large suffix past validation and into the indexer while still
forcing the API to receive and hex-decode the whole blob.

## Example

```ts
import { Payload } from "@morpho-org/midnight-sdk";

console.log(Payload.MAX_ATTRIBUTION_SUFFIX_BYTES);
```
