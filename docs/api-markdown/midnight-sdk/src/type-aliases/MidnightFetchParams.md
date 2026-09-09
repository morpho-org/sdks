[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / MidnightFetchParams

# Type Alias: MidnightFetchParams

> **MidnightFetchParams** = [`DeploylessFetchParameters`](../interfaces/DeploylessFetchParameters.md)

Defined in: [packages/midnight-sdk/src/fetch/types.ts:60](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/types.ts#L60)

Shared viem fetch parameters for Midnight helpers.

## Example

```ts
import type { MidnightFetchParams } from "@morpho-org/midnight-sdk";

const params: MidnightFetchParams = { blockTag: "latest" };
console.log(params.blockTag);
```
