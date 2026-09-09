[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / convexWrapperTokens

# Variable: convexWrapperTokens

> `const` **convexWrapperTokens**: `Record`\<`number`, `Set`\<`` `0x${string}` ``\>\>

Defined in: [packages/morpho-ts/src/addresses.ts:2433](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L2433)

/!\  These tokens can not be listed in `erc20WrapperTokens` because the following specs are different:
- calling `depositFor` supplies on blue instead of minting wrapped token to the user
