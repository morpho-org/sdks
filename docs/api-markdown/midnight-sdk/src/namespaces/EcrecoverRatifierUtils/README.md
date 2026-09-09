[**@morpho-org/sdks**](../../../../README.md)

***

[@morpho-org/sdks](../../../../README.md) / [midnight-sdk/src](../../README.md) / EcrecoverRatifierUtils

# EcrecoverRatifierUtils

EcrecoverRatifier-specific pure utilities.

Use this route for EOA and EIP-7702 makers. The make-side sequence is:
create offers with the Ecrecover ratifier address, build the group/tree,
validate the tree, sign the typed data, call `ratify`, then pass the returned
items to `Payload.encode`. Ecrecover trees must contain one ratifier; split
trees by ratifier before signing. The signer may be the maker or an address
authorized by every maker in the tree. Ratifier helpers accept tree-like
inputs rather than requiring the `Tree` class. Passing an existing `Tree`
remains the optimal path because its cached offers, leaves, root, and height
are reused for typed data and per-leaf proofs.

## Example

```ts
import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";

console.log(EcrecoverRatifierUtils.treeTypeHash(0));
```

## Functions

- [decodeRatifierData](functions/decodeRatifierData.md)
- [digest](functions/digest.md)
- [digestForRoot](functions/digestForRoot.md)
- [digestRatifierData](functions/digestRatifierData.md)
- [encodeRatifierData](functions/encodeRatifierData.md)
- [ratifierData](functions/ratifierData.md)
- [ratify](functions/ratify.md)
- [sign](functions/sign.md)
- [toSignature](functions/toSignature.md)
- [treeTypeHash](functions/treeTypeHash.md)
- [typedData](functions/typedData.md)
- [verifyRatifierData](functions/verifyRatifierData.md)
