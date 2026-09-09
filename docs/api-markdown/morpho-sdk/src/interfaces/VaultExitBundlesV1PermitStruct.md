[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultExitBundlesV1PermitStruct

# Interface: VaultExitBundlesV1PermitStruct

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L17)

Permit tuple consumed by VaultExitBundlesV1.

## Properties

### deadline

> `readonly` **deadline**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L23)

Timestamp after which the permit is invalid.

***

### nonce

> `readonly` **nonce**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L21)

Vault permit nonce signed by the owner.

***

### r

> `readonly` **r**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L27)

ECDSA signature `r`, or zero for the empty-permit sentinel.

***

### s

> `readonly` **s**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L29)

ECDSA signature `s`, or zero for the empty-permit sentinel.

***

### v

> `readonly` **v**: `number`

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L25)

ECDSA recovery identifier, or zero for the empty-permit sentinel.

***

### value

> `readonly` **value**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getVaultExitBundlesV1PermitStruct.ts#L19)

Vault-share allowance authorized by the permit.
