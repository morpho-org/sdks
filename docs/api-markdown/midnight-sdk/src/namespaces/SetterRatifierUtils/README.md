[**@morpho-org/sdks**](../../../../README.md)

***

[@morpho-org/sdks](../../../../README.md) / [midnight-sdk/src](../../README.md) / SetterRatifierUtils

# SetterRatifierUtils

SetterRatifier-specific pure utilities.

Use this route for deployed-code makers. The make-side sequence is: create
offers with the Setter ratifier address, build the group/tree, validate the
tree, approve the root onchain for every maker in the tree, call `ratify`,
then pass the returned items to `Payload.encode`.
Ratifier helpers accept tree-like inputs rather than requiring the `Tree`
class. Passing an existing `Tree` remains the optimal path because its
cached offers, leaves, root, and height are reused when proofs are encoded.

## Example

```ts
import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";

console.log(typeof SetterRatifierUtils.encodeRatifierData);
```

## Functions

- [decodeRatifierData](functions/decodeRatifierData.md)
- [encodeRatifierData](functions/encodeRatifierData.md)
- [ratifierData](functions/ratifierData.md)
- [ratify](functions/ratify.md)
- [verifyRatifierData](functions/verifyRatifierData.md)
