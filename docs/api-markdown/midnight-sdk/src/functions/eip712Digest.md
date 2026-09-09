[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / eip712Digest

# Function: eip712Digest()

> **eip712Digest**(`domainSeparator`, `structHash`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/eip712.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/eip712.ts#L23)

Hashes EIP-712 digest parts as `keccak256(0x1901 || domainSeparator || structHash)`.

Use this when the domain separator and struct hash are already available and
rebuilding full typed-data values would duplicate protocol-specific type maps.

## Parameters

### domainSeparator

`` `0x${string}` ``

EIP-712 domain separator hash.

### structHash

`` `0x${string}` ``

EIP-712 struct hash.

## Returns

`` `0x${string}` ``

Canonical EIP-712 digest.

## Example

```ts
import { eip712Digest } from "@morpho-org/midnight-sdk";

const digest = eip712Digest(
  "0x0000000000000000000000000000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000000000000000000000000000002",
);
console.log(digest);
```
