[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / BigIntish

# Type Alias: BigIntish

> **BigIntish** = `bigint` \| `string` \| `number` \| `boolean`

Defined in: [packages/morpho-ts/src/types.ts:11](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/types.ts#L11)

Primitive value accepted by helpers that coerce inputs with `BigInt`.

## Example

```ts
import type { BigIntish } from "@morpho-org/morpho-ts";

const value: BigIntish = "1000000000000000000";
```
