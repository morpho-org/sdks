---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/liquidity-sdk-viem": patch
"@morpho-org/morpho-sdk": minor
"@morpho-org/wdk-protocol-lending-morpho-evm": minor
---

Add canonical `vaultV1PublicAllocatorAbi` and `vaultV2BluePublicAllocatorAbi` exports plus per-chain `vaultV1PublicAllocator` and `vaultV2BluePublicAllocator` registry entries to `morpho-ts`, preserving `publicAllocatorAbi` and `publicAllocator` as deprecated V1 aliases. Move the shared `marketParamsAbi` source of truth there while preserving its `blue-sdk` re-export, and raise the `blue-sdk` peer range to the introducing `morpho-ts` minor. Add Vault V2 allocation-cap helpers and the updated `canPullFromIdle`/`canPullFromMarket`/WAD-scaled penalty config types to `blue-sdk`, accept iterable active-adapter, vault-allowlist, and reallocation-plan inputs while normalizing them before repeated use, add chain-registry-backed deployless and fallback reads to `blue-sdk-viem`, and expose Vault V2 shared-liquidity discovery, planning, metrics, maximum-penalty filtering, and flat market/idle reallocations through `morpho-sdk` Blue flows.

V2 bundles now pull the proportional loan-token penalty through GeneralAdapter1, grant the allocator an exact non-skippable allowance from Bundler3, pass the configured `uint64 penalty` in calldata, and keep the nonpayable allocator calls out of `tx.value`. The planner mirrors contract execution order for penalties, source deallocation, first vault accrual (including zero-elapsed loss recognition), and target allocation; freezes the resulting relative-cap denominator across later calls for that vault; keeps every adapter coherent with one canonical simulated state per Morpho market; rejects non-positive operation amounts and same-market moves across adapters; and uses the latest timestamp in its complete input snapshot by default.

Use coherent protocol-specific names across the V1 and V2 reallocation APIs, including `VaultV1ReallocationData`, `VaultV2BlueReallocationData`, `computeVaultV1Reallocations`, `VaultV2BluePublicAllocatorOptions`, `VaultV2BluePublicAllocatorConfig`, its fetcher family, and Vault V2-prefixed Bundler actions. Add `MorphoBlue.getVaultV1ReallocationData` and `getVaultV2BlueReallocationData`, preserving the published unversioned `getReallocationData` as a deprecated V1 alias. Keep V1's `defaultMaxWithdrawalUtilization` configurable, and add V2's scalar `maxWithdrawalUtilization` for its friendly phase while retaining the 100% adversarial fallback.

Compatibility note: `VaultV2MorphoMarketV1AdapterV2.ids()` now declares its existing three-element result as `readonly [Hash, Hash, Hash]`. The runtime values and ordering are unchanged, and derived allocation identifiers are immutable descriptors. We intentionally accept this TypeScript assignability tightening in the minor release; callers that explicitly require a mutable `Hash[]` can copy the tuple with `[...adapter.ids(params)]`.

Name allocation-cap helpers `adapterCapId`, `collateralCapId`, and `adapterMarketCapId`. Preserve the published `adapterId`, `collateralId`, and `marketParamsId` helpers as deprecated aliases.

Add an explicit `MorphoBorrowWithVaultV2ReallocationsOptions` WDK opt-in for Vault V2 reallocations and their possible approval requirement while preserving the legacy Vault V1-only `MorphoBorrowOptions` input and authorization-only requirement result type. Reallocation plans must use exactly one vault version per transaction.
