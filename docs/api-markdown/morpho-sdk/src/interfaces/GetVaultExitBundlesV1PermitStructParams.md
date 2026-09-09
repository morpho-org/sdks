[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / GetVaultExitBundlesV1PermitStructParams

# Interface: GetVaultExitBundlesV1PermitStructParams

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L33)

Parameters for [getVaultExitBundlesV1PermitStruct](../functions/getVaultExitBundlesV1PermitStruct.md).

## Properties

### deadline

> `readonly` **deadline**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L37)

Bundle deadline used by the empty-permit sentinel.

***

### requirementSignature?

> `readonly` `optional` **requirementSignature?**: [`PermitRequirementSignature`](PermitRequirementSignature.md)

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L39)

Optional signed bounded ERC-2612 requirement.

***

### vault

> `readonly` **vault**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:35](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L35)

Vault share token authorized by the permit.
