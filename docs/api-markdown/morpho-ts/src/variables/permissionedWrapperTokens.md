[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / permissionedWrapperTokens

# Variable: permissionedWrapperTokens

> `const` **permissionedWrapperTokens**: `Record`\<`number`, `Set`\<`` `0x${string}` ``\>\>

Defined in: [packages/morpho-ts/src/addresses.ts:2369](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L2369)

The registry of all known PermissionedERC20Wrapper with a `hasPermission` getter.
All permissioned wrapper tokens are considered ERC20Wrapper and automatically added to the erc20WrapperTokens registry.
