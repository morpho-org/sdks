[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [Payload](../README.md) / MAX\_PAYLOAD\_BYTES

# Variable: MAX\_PAYLOAD\_BYTES

> `const` **MAX\_PAYLOAD\_BYTES**: `1000000` = `1_000_000`

Defined in: [packages/midnight-sdk/src/signatures/Payload.ts:128](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Payload.ts#L128)

Largest fully framed wire payload, in bytes, matching the router/onchain
mempool cap.

## Example

```ts
import { Payload } from "@morpho-org/midnight-sdk";

console.log(Payload.MAX_PAYLOAD_BYTES);
```
