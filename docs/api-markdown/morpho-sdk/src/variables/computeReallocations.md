[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / computeReallocations

# ~~Variable: computeReallocations~~

> `const` **computeReallocations**: (`__namedParameters`) => readonly [`VaultV1Reallocation`](../interfaces/VaultV1Reallocation.md)[] = `computeVaultV1Reallocations`

Defined in: [packages/morpho-sdk/src/helpers/computeVaultV1Reallocations.ts:326](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/computeVaultV1Reallocations.ts#L326)

Deprecated name for the Vault V1 amount-aware reallocation planner.

Computes vault reallocations for a `borrow` or `withdraw` on a target market.

First attempts "friendly" reallocations respecting withdrawal utilization
targets, then falls back to aggressive reallocations (100% withdrawal
utilization) if liquidity is still insufficient.

Algebra branches on `operation`:
- `"borrow"`: `S' = S`, `B' = B + amount` (additional borrow demand).
- `"withdraw"`: `S' = S − amount`, `B' = B` (supply-side shrinkage).

In both cases reallocated assets are added on the supply side; `requiredAssets`
and `absoluteShortfall` are derived from the operation-specific post-state.

## Parameters

### \_\_namedParameters

#### amount

`bigint`

#### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

#### operation

`"borrow"` \| `"withdraw"`

#### options?

[`ReallocationComputeOptions`](../interfaces/ReallocationComputeOptions.md)

#### reallocationData

`VaultV1ReallocationData`

## Returns

readonly [`VaultV1Reallocation`](../interfaces/VaultV1Reallocation.md)[]

Array of vault reallocations, sorted with withdrawals in ascending market id order.

## Remarks

Pass `options.timestamp` from the same block used to fetch `reallocationData`; when omitted, market accrual falls back to the target market's `lastUpdate`, which can diverge from the source rows' fetch block. Per-market `maxWithdrawalUtilization` overrides apply only to phase 1; phase 2 forces 100% utilization on every source market.

## Throws

when shared liquidity cannot cover the operation's absolute shortfall on the target market — preventing fee-bearing reallocations from being attached to a call that would still revert onchain.

## Throws

when `operation === "withdraw"` and `amount` exceeds the target market's `totalSupplyAssets` — the on-chain call would revert regardless of reallocations.

## Throws

when a selected vault is missing its public allocator config.

## Deprecated

Vault V1 shared-liquidity planning will be removed in the next major. Use
`VaultV2BlueReallocationData.computeVaultV2BlueReallocations`.

## Example

```ts
import { createPublicClient, http, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { markets, vaults } from "@morpho-org/morpho-test";
import {
  computeVaultV1Reallocations,
  morphoViemExtension,
} from "@morpho-org/morpho-sdk";

const client = createPublicClient({
  chain: mainnet,
  transport: http(),
}).extend(morphoViemExtension());

const userAddress = "0x000000000000000000000000000000000000dEaD";
const marketParams = markets[mainnet.id].usdc_wbtc;
const market = client.morpho.blue(marketParams, mainnet.id);
const block = await client.getBlock();
const reallocationData = await market.getVaultV1ReallocationData({
  vaultAddresses: [vaults[mainnet.id].steakUsdc.address],
  block: { number: block.number, timestamp: block.timestamp },
});
const borrowAmount = parseUnits("1000", 6);
const reallocations = computeVaultV1Reallocations({
  reallocationData,
  marketId: marketParams.id,
  operation: "borrow",
  amount: borrowAmount,
  options: { timestamp: block.timestamp },
});
const positionData = await market.getPositionData(userAddress);
const borrow = market.borrow({
  userAddress,
  amount: borrowAmount,
  positionData,
  reallocations,
});
// borrow.buildTx() includes any required PublicAllocator reallocations.
```

## Deprecated

Vault V1 shared-liquidity planning will be removed in the next major. Use
`VaultV2BlueReallocationData.computeVaultV2BlueReallocations`.
