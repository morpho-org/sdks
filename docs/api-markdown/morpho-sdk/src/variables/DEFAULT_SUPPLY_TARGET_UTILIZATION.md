[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / DEFAULT\_SUPPLY\_TARGET\_UTILIZATION

# Variable: DEFAULT\_SUPPLY\_TARGET\_UTILIZATION

> `const` **DEFAULT\_SUPPLY\_TARGET\_UTILIZATION**: `900000000000000000n` = `90_0000000000000000n`

Defined in: [packages/morpho-sdk/src/helpers/constant.ts:31](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/constant.ts#L31)

The default target utilization above which shared liquidity reallocations are
triggered (and the level the target market is brought back to), scaled by WAD.
Still overridable through the deprecated `supplyTargetUtilization` /
`defaultSupplyTargetUtilization` options until the next major.
