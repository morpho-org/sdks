[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / SETTLEMENT\_FEE\_BREAKPOINTS

# Variable: SETTLEMENT\_FEE\_BREAKPOINTS

> `const` **SETTLEMENT\_FEE\_BREAKPOINTS**: readonly \[`0n`, `bigint`, `bigint`, `bigint`, `bigint`, `bigint`, `bigint`\]

Defined in: [packages/midnight-sdk/src/constants.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/constants.ts#L28)

Settlement-fee time-to-maturity breakpoints in seconds.

Midnight linearly interpolates each market's seven settlement-fee cbp
buckets across these breakpoints.

## Example

```ts
import { SETTLEMENT_FEE_BREAKPOINTS } from "@morpho-org/midnight-sdk";

console.log(SETTLEMENT_FEE_BREAKPOINTS[1]);
```
