[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / permissionedCoinbaseTokens

# Variable: permissionedCoinbaseTokens

> `const` **permissionedCoinbaseTokens**: `Record`\<`number`, `Set`\<`` `0x${string}` ``\>\>

Defined in: [packages/morpho-ts/src/addresses.ts:2390](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L2390)

The registry of all known permissioned wrapped tokens that require a Coinbase attestation.
All permissioned Coinbase tokens are considered PermissionedERC20Wrapper and automatically added to the permissionedWrapperTokens registry.
