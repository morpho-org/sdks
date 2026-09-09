[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [AdaptiveCurveIrmLib](../README.md) / WEXP\_UPPER\_BOUND

# Variable: WEXP\_UPPER\_BOUND

> `const` **WEXP\_UPPER\_BOUND**: `93859467695000404319n` = `93_859467695000404319n`

Defined in: [packages/blue-sdk/src/math/AdaptiveCurveIrmLib.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/math/AdaptiveCurveIrmLib.ts#L37)

Above this bound, `wExp` is clipped to avoid overflowing when multiplied with 1 ether.
This upper bound corresponds to: ln(type(int256).max / 1e36) (scaled by WAD, floored).
