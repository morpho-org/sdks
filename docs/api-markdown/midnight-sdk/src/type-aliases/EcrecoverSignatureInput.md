[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / EcrecoverSignatureInput

# Type Alias: EcrecoverSignatureInput

> **EcrecoverSignatureInput** = `Hex` \| `Signature` \| `Signature`\<`number`, `number`\>

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:247](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L247)

Hex string or viem signature accepted by Ecrecover ratifier helpers.

## Example

```ts
import type { EcrecoverSignatureInput } from "@morpho-org/midnight-sdk";

const signature = "0x" as EcrecoverSignatureInput;
console.log(signature);
```
