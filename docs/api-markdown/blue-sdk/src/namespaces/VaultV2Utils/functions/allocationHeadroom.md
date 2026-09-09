[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [VaultV2Utils](../README.md) / allocationHeadroom

# Function: allocationHeadroom()

> **allocationHeadroom**(`allocation`, `firstTotalAssets`): [`CapacityLimit`](../../../interfaces/CapacityLimit.md)

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Utils.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Utils.ts#L26)

Computes the remaining assets permitted by one Vault V2 allocation's
absolute and relative caps.

## Parameters

### allocation

`Readonly`\<[`IVaultV2Allocation`](../../../interfaces/IVaultV2Allocation.md)\>

Current allocation and its absolute and relative caps.

### firstTotalAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Transaction-frozen Vault V2 total assets used as the relative-cap denominator.

## Returns

[`CapacityLimit`](../../../interfaces/CapacityLimit.md)

The remaining allocation capacity and the cap that binds it.

## Example

```ts
import { VaultV2Utils } from "@morpho-org/blue-sdk";

const headroom = VaultV2Utils.allocationHeadroom(
  { id: "0x0000000000000000000000000000000000000000000000000000000000000000", absoluteCap: 100n, relativeCap: 500000000000000000n, allocation: 40n },
  160n,
);
// headroom.value === 40n
```
