[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [VaultV2BlueMarketPublicAllocatorConfigUtils](../README.md) / getMaxIn

# Function: getMaxIn()

> **getMaxIn**(`config`, `allocation`): `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfigUtils.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfigUtils.ts#L24)

Computes the assets that may still be allocated under the allocator cap.

## Parameters

### config

`Pick`\<[`IVaultV2BlueMarketPublicAllocatorConfig`](../../../interfaces/IVaultV2BlueMarketPublicAllocatorConfig.md), `"absoluteCap"`\>

Configuration or compatible object carrying the absolute cap.

### allocation

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Effective current allocation, including untracked assets.

## Returns

`bigint`

Remaining allocator capacity, floored at zero.

## Example

```ts
import { VaultV2BlueMarketPublicAllocatorConfigUtils } from "@morpho-org/blue-sdk";

const maxIn = VaultV2BlueMarketPublicAllocatorConfigUtils.getMaxIn(
  { absoluteCap: 100n },
  40n,
);
// maxIn === 60n
```
