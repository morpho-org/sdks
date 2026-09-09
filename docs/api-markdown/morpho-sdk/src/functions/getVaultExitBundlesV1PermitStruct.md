[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / getVaultExitBundlesV1PermitStruct

# Function: getVaultExitBundlesV1PermitStruct()

> **getVaultExitBundlesV1PermitStruct**(`params`): [`VaultExitBundlesV1PermitStruct`](../interfaces/VaultExitBundlesV1PermitStruct.md)

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:67](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L67)

Returns the permit struct consumed by VaultExitBundlesV1 from an optional vault-share
requirement signature.

Without a signature, returns the contract's empty-permit sentinel. With a signature, validates
the ERC-2612 kind and vault asset before splitting the serialized signature.
Owner, spender, deadline, nonce, and cryptographic validity are verified onchain by the vault.

## Parameters

### params

[`GetVaultExitBundlesV1PermitStructParams`](../interfaces/GetVaultExitBundlesV1PermitStructParams.md)

## Returns

[`VaultExitBundlesV1PermitStruct`](../interfaces/VaultExitBundlesV1PermitStruct.md)

The VaultExitBundlesV1 permit tuple.

## Throws

when the requirement has the wrong permit kind, asset, or signature encoding.

## Example

```ts
import { getVaultExitBundlesV1PermitStruct } from "@morpho-org/morpho-sdk";

const permit = getVaultExitBundlesV1PermitStruct({
  vault,
  deadline,
  requirementSignature,
});
// permit satisfies VaultExitBundlesV1PermitStruct
```
