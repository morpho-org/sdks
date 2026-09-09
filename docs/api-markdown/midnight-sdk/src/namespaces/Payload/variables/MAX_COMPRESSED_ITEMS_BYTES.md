[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [Payload](../README.md) / MAX\_COMPRESSED\_ITEMS\_BYTES

# Variable: MAX\_COMPRESSED\_ITEMS\_BYTES

> `const` **MAX\_COMPRESSED\_ITEMS\_BYTES**: `number`

Defined in: [packages/midnight-sdk/src/signatures/Payload.ts:144](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Payload.ts#L144)

Maximum gzip-compressed item bytes accepted by the payload codec.

The budget reserves room for the fixed header and the largest accepted
attribution suffix so the full wire payload never exceeds
[MAX\_PAYLOAD\_BYTES](MAX_PAYLOAD_BYTES.md).

## Example

```ts
import { Payload } from "@morpho-org/midnight-sdk";

console.log(Payload.MAX_COMPRESSED_ITEMS_BYTES);
```
