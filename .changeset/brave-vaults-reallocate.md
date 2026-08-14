---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/liquidity-sdk-viem": minor
"@morpho-org/wdk-protocol-lending-morpho-evm": minor
---

Add the canonical `vaultV2BluePublicAllocatorAbi` to `morpho-ts`, move the shared `marketParamsAbi` source of truth there while preserving its `blue-sdk` re-export, and raise the `blue-sdk` peer range to the introducing `morpho-ts` minor. Add Vault V2 allocation-cap helpers and the updated `canPullFromIdle`/`canPullFromMarket`/WAD-scaled penalty config types to `blue-sdk`, add explicit-allocator deployless and fallback reads to `blue-sdk-viem`, and expose Vault V2 shared-liquidity discovery, planning, metrics, maximum-penalty filtering, and flat market/idle reallocations through `morpho-sdk` Blue flows.

V2 bundles now pull the proportional loan-token penalty through GeneralAdapter1, grant the allocator an exact non-skippable allowance from Bundler3, pass the configured `uint64 penalty` in calldata, and keep the nonpayable allocator calls out of `tx.value`. The planner mirrors contract execution order for penalties, source deallocation, first vault accrual, and target allocation; rejects same-market moves across adapters; and uses the latest timestamp in its complete input snapshot by default.

Use coherent versioned names across the V1 and V2 reallocation APIs, including `VaultV1ReallocationData`, `VaultV2ReallocationData`, `computeVaultV1Reallocations`, `computeVaultV2Reallocations`, `VaultV2BluePublicAllocatorOptions`, and Vault V2-prefixed Bundler actions. Preserve the published V1 names as deprecated aliases.

Compatibility note: `VaultV2MorphoMarketV1AdapterV2.ids()` now declares its existing three-element result as `readonly [Hash, Hash, Hash]`. The runtime values and ordering are unchanged, and derived allocation identifiers are immutable descriptors. We intentionally accept this TypeScript assignability tightening in the minor release; callers that explicitly require a mutable `Hash[]` can copy the tuple with `[...adapter.ids(params)]`.

Add an independent REST-backed `VaultV2LiquidityLoader` alongside the existing Vault V1 loader. It validates successful API payloads at runtime, pins REST and RPC hydration to one indexed block, anchors live REST market totals to that block's timestamp to prevent double accrual, and fails explicitly on incomplete positions instead of treating missing state as zero. Raise its `blue-sdk`, `blue-sdk-viem`, `morpho-sdk`, and `morpho-ts` peer floors to the introducing versions.

Add an explicit `MorphoBorrowWithV2ReallocationsOptions` WDK opt-in for the combined V1/V2 reallocation union and its possible approval requirement while preserving the legacy `MorphoBorrowOptions` input and authorization-only requirement result type.
