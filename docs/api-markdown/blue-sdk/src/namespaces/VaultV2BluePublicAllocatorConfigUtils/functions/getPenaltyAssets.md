[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [VaultV2BluePublicAllocatorConfigUtils](../README.md) / getPenaltyAssets

# Function: getPenaltyAssets()

> **getPenaltyAssets**(`config`, `assets`): `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfigUtils.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfigUtils.ts#L24)

Computes the independently rounded penalty charged for one reallocation.

## Parameters

### config

`Pick`\<[`IVaultV2BluePublicAllocatorConfig`](../../../interfaces/IVaultV2BluePublicAllocatorConfig.md), `"penalty"`\>

Configuration or compatible object carrying the WAD-scaled penalty.

### assets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Assets reallocated by the allocator.

## Returns

`bigint`

Penalty assets rounded up exactly as the allocator charges them.

## Example

```ts
import { VaultV2BluePublicAllocatorConfigUtils } from "@morpho-org/blue-sdk";

const penaltyAssets = VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets(
  { penalty: 500_000_000_000_000_000n },
  3n,
);
// penaltyAssets === 2n
```
