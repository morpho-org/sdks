[**@morpho-org/sdks**](../../../../README.md)

***

[@morpho-org/sdks](../../../../README.md) / [midnight-sdk/src](../../README.md) / TreeUtils

# TreeUtils

Object-compatible tree hashing, root, proof, and verification helpers.

Use these when you need pure tree hashing, descriptor construction, or proof
verification. In the normal make-side flow, `Tree.create` wraps descriptor
construction; proof helpers accept the built `Tree` so cached leaves/root are
reused.

## Example

```ts
import { TreeUtils } from "@morpho-org/midnight-sdk";

console.log(typeof TreeUtils.buildRoot);
```

## Functions

- [buildDescriptor](functions/buildDescriptor.md)
- [buildProof](functions/buildProof.md)
- [buildRoot](functions/buildRoot.md)
- [hashNode](functions/hashNode.md)
- [mempoolValidate](functions/mempoolValidate.md)
- [verifyProof](functions/verifyProof.md)
