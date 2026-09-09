[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / EncodeVaultSharesPermitParams

# Interface: EncodeVaultSharesPermitParams

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts:15](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts#L15)

Parameters for [encodeVaultSharesPermit](../functions/encodeVaultSharesPermit.md).

## Properties

### amount

> `readonly` **amount**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts#L29)

Vault-share allowance to authorize.

***

### chainId

> `readonly` **chainId**: `number`

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts#L25)

Target chain.

***

### deadline

> `readonly` **deadline**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts:31](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts#L31)

Shared permit and bundle deadline.

***

### nonce

> `readonly` **nonce**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts#L27)

Current vault permit nonce for the owner.

***

### owner

> `readonly` **owner**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts#L23)

Account that owns the vault shares.

***

### spender

> `readonly` **spender**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts#L21)

VaultExitBundlesV1 spender.

***

### vault

> `readonly` **vault**: [`Token`](../../../blue-sdk/src/classes/Token.md)

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts#L17)

Vault share token, including V1 permit-domain metadata when available.

***

### version

> `readonly` **version**: `"vaultV2"` \| `"vaultV1"`

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeVaultSharesPermit.ts#L19)

Vault generation, which selects the standard V1 or two-field V2 domain.
