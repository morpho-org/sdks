# @morpho-org/morpho-ts

## 2.11.1-next.0

### Patch Changes

- [#987](https://github.com/morpho-org/sdks/pull/987) [`ceb5083`](https://github.com/morpho-org/sdks/commit/ceb5083f8800b5b890958abe10bee7df4c53e3e2) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Fix malformed `explorerUrl` values in `ChainUtils.CHAIN_METADATA`. Arc mainnet (5042) pointed at `http://explorer.arc.io/`, the only non-HTTPS explorer of the 43 registered chains, so every link built from it was an insecure navigation out of an HTTPS app. It is now `https://explorer.arc.io`. The trailing slash is also dropped from Tac, Celo, Abstract and Soneium so all 43 entries match the bare-origin convention and consumers concatenating `/tx/<hash>` or `/address/<addr>` no longer produce a double slash.

## 2.11.0

### Minor Changes

- [#953](https://github.com/morpho-org/sdks/pull/953) [`17f430b`](https://github.com/morpho-org/sdks/commit/17f430b15c25c50129ff461a7315a7e1acaa64b1) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Register the canonical `VaultBundlesV1` and `BlueBundlesV1` deployments in the `bundles` group of
  `ChainAddresses`, alongside the existing `bundles.vaultExitBundlesV1` entry. The `AddressLabel`
  union gains `bundles.vaultBundlesV1` and `bundles.blueBundlesV1`, so
  `getChainAddress(chainId, "bundles.vaultBundlesV1")`,
  `getChainAddress(chainId, "bundles.blueBundlesV1")`, and `registerCustomAddresses` resolve the new
  entries like any other registry address. Both fields are optional so chains that only expose
  `vaultExitBundlesV1` remain valid.

  Addresses are sourced from the canonical deployment registry
  (`morpho-org/deployments` `address-book.json`) and cover Ethereum, Base, Arbitrum, Optimism,
  Polygon, World Chain, Unichain, HyperEVM, Katana, Monad, Stable, Tempo, and Robinhood Chain — the
  same thirteen chains that already register `VaultExitBundlesV1`.

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their
  latest releases resolve the new registry entries.

## 2.10.0

### Minor Changes

- [#919](https://github.com/morpho-org/sdks/pull/919) [`402175b`](https://github.com/morpho-org/sdks/commit/402175b32cc37e0da9e7b33495080a695941fa71) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add canonical `vaultV1PublicAllocatorAbi` and `vaultV2BluePublicAllocatorAbi` exports plus per-chain `vaultV1PublicAllocator` and `vaultV2BluePublicAllocator` registry entries to `morpho-ts`, preserving `publicAllocatorAbi` and `publicAllocator` as deprecated V1 aliases. Move the shared `marketParamsAbi` source of truth to its `abis/marketParams` leaf export while preserving the aggregate `abis` and `blue-sdk` re-exports, and raise the `blue-sdk` peer range to the introducing `morpho-ts` minor. Add Vault V2 allocation-cap helpers and the updated `canPullFromIdle`/`canPullFromMarket`/WAD-scaled penalty config types to `blue-sdk`, accept iterable active-adapter, vault-allowlist, and reallocation-plan inputs while materializing them before repeated use, add chain-registry-backed deployless and fallback reads to `blue-sdk-viem`, and expose Vault V2 shared-liquidity discovery, planning, metrics, maximum-penalty filtering, and flat market/idle reallocations through `morpho-sdk` Blue flows.

  V2 bundles now reject chains without a registered BluePublicAllocator before exposing requirements, pull the proportional loan-token penalty through GeneralAdapter1, grant the allocator an exact non-skippable allowance from Bundler3 after first resetting it to zero, pass the configured `uint64 penalty` in calldata, and keep the nonpayable allocator calls out of `tx.value`. `VaultV2BluePublicAllocatorConfig` is hydrated as a class with exact per-call penalty calculation, `VaultV2BlueMarketPublicAllocatorConfig` computes max-in capacity from its absolute cap, and plan totals stay local to their consumers. The planner mirrors contract execution order for penalties, source deallocation, first vault accrual (including zero-elapsed loss recognition), and target allocation; freezes the resulting relative-cap denominator across later calls for that vault; separates shared-ID validation from non-shared upper-bound search, may exceed an operation's preferred ceiling when a penalty donation imposes a higher shared-cap lower bound, and conservatively omits max-failing shared-cap candidates instead of scanning non-monotonic base-unit amounts; keeps every adapter coherent with one canonical simulated state per Morpho market; preserves supplied address casing while matching vaults and adapters case-insensitively; rejects incomplete allocator snapshots instead of silently reporting no liquidity; rejects non-positive operation amounts and same-market moves across adapters; and uses the latest timestamp in its complete input snapshot by default.

  Use coherent protocol-specific names across the V1 and V2 reallocation APIs, including `VaultV1ReallocationData`, `VaultV2BlueReallocationData`, `computeVaultV1Reallocations`, `VaultV2BluePublicAllocatorOptions`, `VaultV2BluePublicAllocatorConfig`, its fetcher family, and Vault V2-prefixed Bundler actions. Add `MorphoBlue.getVaultV1ReallocationData`, `getVaultV1Reallocations`, `getVaultV2BlueReallocationData`, and `getVaultV2BlueReallocations`; preserve the published unversioned `getReallocationData` and `getReallocations` as deprecated V1 aliases. Both versioned planners reject reallocation snapshots from another chain. Keep V1's `defaultMaxWithdrawalUtilization` configurable, and add V2's scalar `maxWithdrawalUtilization` for its friendly phase while retaining the 100% adversarial fallback.

  Compatibility note: this minor intentionally accepts four breaking changes. `VaultV2MorphoMarketV1Adapter.ids()` and `VaultV2MorphoMarketV1AdapterV2.ids()` now return the labeled readonly tuple `readonly [adapterCapId: Hash, collateralCapId: Hash, adapterMarketCapId: Hash]` instead of mutable `Hash[]`, while `VaultV2MorphoVaultV1Adapter.ids()` now returns `readonly [adapterCapId: Hash]`; `MorphoBlue.withdraw`, `borrow`, and `refinance` may now return `Transaction<ERC20ApprovalAction>` from `getRequirements()` for Vault V2 penalty funding; `BlueWithdrawAction`, `BlueBorrowAction`, `BlueSupplyCollateralBorrowAction`, and `BlueRefinanceAction` now require `reallocationPenaltyAssets`; and Vault V2 reallocation discovery now accepts only zero-penalty vaults by default. Runtime ordering for `ids()` is unchanged. Consumers should spread `ids()` when a mutable array is required, handle approval transactions in exhaustive requirement consumers, set `reallocationPenaltyAssets: 0n` in handwritten V1 or no-penalty action descriptors, and explicitly set `maxPenalty` when opting into a nonzero Vault V2 allocator penalty. Explicit and hand-built penalties remain supported up to WAD (100%), preserving the existing maximum.

  Name allocation-cap helpers `adapterCapId`, `collateralCapId`, and `adapterMarketCapId`. Preserve the published `adapterId`, `collateralId`, and `marketParamsId` helpers as deprecated aliases.

  Add an explicit `MorphoBorrowWithVaultV2ReallocationsOptions` WDK opt-in for Vault V2 reallocations and their possible approval requirement while preserving the legacy Vault V1-only `MorphoBorrowOptions` input and authorization-only requirement result type. Reallocation plans must use exactly one vault version per transaction.

- [#936](https://github.com/morpho-org/sdks/pull/936) [`cde4052`](https://github.com/morpho-org/sdks/commit/cde4052c5f72e8345aae1b4ae863290e7c5b7f66) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Synchronize maintained chain address and deployment-block registries with the current deployments repository.

## 2.9.0

### Minor Changes

- [#915](https://github.com/morpho-org/sdks/pull/915) [`2c76ea5`](https://github.com/morpho-org/sdks/commit/2c76ea50ee1f29d2c3a5a74f9bddd9e34910378a) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Add a `bundles` group to `ChainAddresses` for standalone bundle periphery contracts, starting with
  `bundles.vaultExitBundlesV1`. The `AddressLabel` union gains `bundles.vaultExitBundlesV1`, so
  `getChainAddress(chainId, "bundles.vaultExitBundlesV1")` and `registerCustomAddresses` resolve the
  new entry like any other registry address. Register the canonical `VaultExitBundlesV1` deployments
  and deployment blocks on Ethereum, Base, Arbitrum, Optimism, Polygon, World Chain, Unichain,
  HyperEVM, Katana, Monad, Stable, Tempo, and Robinhood Chain.

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their
  latest releases resolve the new registry entry.

  Add Vault V1 and Vault V2 in-kind redemption actions and entity methods backed by
  VaultExitBundlesV1, including bounded share permit/approval requirements, Vault V2's two-field
  permit domain, snapshot coverage validation, and Morpho Blue balance checks.
  Vault V2's `toShares` now accepts an optional rounding direction so callers can reproduce its
  rounded-up withdrawal preview without duplicating share-conversion math.
  Vault V1 exits also reject vaults configured as Morpho Blue's fee recipient, which the periphery
  cannot safely account for when protocol fee shares accrue.
  Add a minimal Vault V2 preview helper for frontend eligibility, market capacity, and proceeds.
  Match the deployed contract at upstream commit `9994e6abe5b18d5f7e0d6bd666f85eb259e3312f`,
  including its idle-assets-first Vault V2 exit behavior. The deployed ABI is unchanged. Fork tests
  now use the canonical Ethereum deployment directly.

## 2.8.0

### Minor Changes

- [#849](https://github.com/morpho-org/sdks/pull/849) [`ca3d727`](https://github.com/morpho-org/sdks/commit/ca3d7276012f37238646f99212ee12416aba2b43) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Harden Midnight SDK API, fetch, offer, group, tree, and package-export behavior for Cantina audit findings.

## 2.7.0

### Minor Changes

- [#841](https://github.com/morpho-org/sdks/pull/841) [`1848eb4`](https://github.com/morpho-org/sdks/commit/1848eb47e794acbf50eedd4a10eb51fee8576a1b) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add Robinhood Chain (chain id 4663) to the shared chain and address registries.

  Register the `ChainId.RobinhoodMainnet` enum member, its explorer/native-currency metadata, and its era-2 Morpho Blue, AdaptiveCurveIrm, Bundler3, VaultV2, adapter-factory, registry, oracle-factory, pre-liquidation-factory, and wrapped-native addresses (sourced from the `morpho-org/deployments` address book).

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entry.

- [#712](https://github.com/morpho-org/sdks/pull/712) [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4) Thanks [@0xbulma](https://github.com/0xbulma)! - Move shared Blue and Midnight SDK primitives to `@morpho-org/morpho-ts`: chain metadata, address/deployment registries, fixed-point math helpers, shared bigint types, typed registry/math errors, `ORACLE_PRICE_SCALE`, `assertNonNegative`, and `_try`.

  Expose shared ABI literals through `@morpho-org/morpho-ts/abis` so root utility imports do not load the ABI table.

  Model addresses as a unified flat Morpho registry so Blue and Midnight addresses live on the same chain entry and resolve through the protocol-agnostic `getChainAddresses`, `getChainAddress`, and `registerCustomAddresses` helpers.

  Keep `@morpho-org/blue-sdk` compatible by re-exporting the extracted chain, address, math, `_try`, and error surfaces from `@morpho-org/morpho-ts`, and remove the now-unused lodash registry merge dependencies from `@morpho-org/blue-sdk`.

  Expose the shared address registry helpers and registry types through `@morpho-org/morpho-sdk` so integrators can import the cross-protocol address surface from the main SDK package.

  Update maintained dependents of `@morpho-org/blue-sdk` and `@morpho-org/morpho-ts`, including peer dependents, so published packages resolve the extracted shared primitives used by the Blue SDK compatibility layer.

### Patch Changes

- [#828](https://github.com/morpho-org/sdks/pull/828) [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add World Chain USDC with permit version 2 support to the shared address registry.

  Normalize fallback Circle permit token address checks so known USDC/EURC addresses use permit domain version `"2"` regardless of caller-provided address casing.

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entry.

- [#848](https://github.com/morpho-org/sdks/pull/848) [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Update Midnight ABI/hash helpers and register Base Midnight deployment addresses.

## 2.6.0

### Minor Changes

- [#748](https://github.com/morpho-org/sdks/pull/748) [`6d59b5a`](https://github.com/morpho-org/sdks/commit/6d59b5abdcdab7f5da3df826ea4556899a5b765d) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Deprecate unused `WithId` and `WithIndex` utility types, deprecate legacy CDN and optimizer URL constants, and point `REWARDS_BASE_URL` to the campaigns subdomain.

## 2.5.3

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

## 2.5.2

### Patch Changes

- [#655](https://github.com/morpho-org/sdks/pull/655) [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Re-export consolidated blue-sdk, blue-sdk-viem, and utility surfaces from morpho-sdk through canonical root and subpath entrypoints.

  New root action type imports from `@morpho-org/morpho-sdk`:

  - `MarketV1Actions` from `@morpho-org/morpho-sdk`
  - `VaultV1Actions` from `@morpho-org/morpho-sdk`
  - `VaultV2Actions` from `@morpho-org/morpho-sdk`

  New imports from `@morpho-org/morpho-sdk/types`:

  - `BigIntish` from `@morpho-org/morpho-sdk/types`
  - `ChainMetadata` from `@morpho-org/morpho-sdk/types`
  - `CollateralAllocation` from `@morpho-org/morpho-sdk/types`
  - `DeploylessFetchParameters` from `@morpho-org/morpho-sdk/types`
  - `Eip712Field` from `@morpho-org/morpho-sdk/types`
  - `Erc20AllowanceRecipient` from `@morpho-org/morpho-sdk/types`
  - `Failable` from `@morpho-org/morpho-sdk/types`
  - `Fetchable` from `@morpho-org/morpho-sdk/types`
  - `FetchParameters` from `@morpho-org/morpho-sdk/types`
  - `InputMarketParams` from `@morpho-org/morpho-sdk/types`
  - `IPermit2Allowance` from `@morpho-org/morpho-sdk/types`
  - `Loadable` from `@morpho-org/morpho-sdk/types`
  - `MarketId` from `@morpho-org/morpho-sdk/types`
  - `MaxBorrowOptions` from `@morpho-org/morpho-sdk/types`
  - `MaxPositionCapacities` from `@morpho-org/morpho-sdk/types`
  - `MaxWithdrawCollateralOptions` from `@morpho-org/morpho-sdk/types`
  - `Pending` from `@morpho-org/morpho-sdk/types`
  - `Permit2Allowance` from `@morpho-org/morpho-sdk/types`

  New error imports from `@morpho-org/morpho-sdk/errors`:

  - `_try` from `@morpho-org/morpho-sdk/errors`
  - `BlueErrors` from `@morpho-org/morpho-sdk/errors`
  - `InvalidMarketParamsError` from `@morpho-org/morpho-sdk/errors`
  - `UnknownDataError` from `@morpho-org/morpho-sdk/errors`
  - `UnknownFactory` from `@morpho-org/morpho-sdk/errors`
  - `UnknownMarketParamsError` from `@morpho-org/morpho-sdk/errors`
  - `UnknownOfFactory` from `@morpho-org/morpho-sdk/errors`
  - `UnknownTokenError` from `@morpho-org/morpho-sdk/errors`
  - `UnknownTokenPriceError` from `@morpho-org/morpho-sdk/errors`
  - `UnknownVaultConfigError` from `@morpho-org/morpho-sdk/errors`
  - `UnsupportedChainIdError` from `@morpho-org/morpho-sdk/errors`
  - `UnsupportedPreLiquidationParamsError` from `@morpho-org/morpho-sdk/errors`
  - `UnsupportedVaultV2AdapterError` from `@morpho-org/morpho-sdk/errors`
  - `VaultV2Errors` from `@morpho-org/morpho-sdk/errors`

  New error type imports from `@morpho-org/morpho-sdk/errors`:

  - `ErrorClass` from `@morpho-org/morpho-sdk/errors`

  New address imports from `@morpho-org/morpho-sdk/addresses`:

  - `addresses` from `@morpho-org/morpho-sdk/addresses`
  - `addressesRegistry` from `@morpho-org/morpho-sdk/addresses`
  - `convexWrapperTokens` from `@morpho-org/morpho-sdk/addresses`
  - `deployments` from `@morpho-org/morpho-sdk/addresses`
  - `erc20WrapperTokens` from `@morpho-org/morpho-sdk/addresses`
  - `getChainAddresses` from `@morpho-org/morpho-sdk/addresses`
  - `getPermissionedCoinbaseTokens` from `@morpho-org/morpho-sdk/addresses`
  - `getUnwrappedToken` from `@morpho-org/morpho-sdk/addresses`
  - `NATIVE_ADDRESS` from `@morpho-org/morpho-sdk/addresses`
  - `permissionedBackedTokens` from `@morpho-org/morpho-sdk/addresses`
  - `permissionedCoinbaseTokens` from `@morpho-org/morpho-sdk/addresses`
  - `permissionedWrapperTokens` from `@morpho-org/morpho-sdk/addresses`
  - `registerCustomAddresses` from `@morpho-org/morpho-sdk/addresses`
  - `unwrappedTokensMapping` from `@morpho-org/morpho-sdk/addresses`

  New address type imports from `@morpho-org/morpho-sdk/addresses`:

  - `AddressLabel` from `@morpho-org/morpho-sdk/addresses`
  - `ChainAddresses` from `@morpho-org/morpho-sdk/addresses`
  - `ChainDeployments` from `@morpho-org/morpho-sdk/addresses`

  New constants imports from `@morpho-org/morpho-sdk/constants`:

  - `APPROVE_ONLY_ONCE_TOKENS` from `@morpho-org/morpho-sdk/constants`
  - `BLUE_API_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `BLUE_API_GRAPHQL_URL` from `@morpho-org/morpho-sdk/constants`
  - `CDN_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `ChainId` from `@morpho-org/morpho-sdk/constants`
  - `ChainUtils` from `@morpho-org/morpho-sdk/constants`
  - `DEFAULT_LLTV_BUFFER` from `@morpho-org/morpho-sdk/constants`
  - `DEFAULT_SUPPLY_TARGET_UTILIZATION` from `@morpho-org/morpho-sdk/constants`
  - `DEFAULT_SLIPPAGE_TOLERANCE` from `@morpho-org/morpho-sdk/constants`
  - `DEFAULT_WITHDRAWAL_TARGET_UTILIZATION` from `@morpho-org/morpho-sdk/constants`
  - `DOCS_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `EIP_712_FIELDS` from `@morpho-org/morpho-sdk/constants`
  - `isMarketId` from `@morpho-org/morpho-sdk/constants`
  - `LIQUIDATION_CURSOR` from `@morpho-org/morpho-sdk/constants`
  - `MAX_ABSOLUTE_SHARE_PRICE` from `@morpho-org/morpho-sdk/constants`
  - `MAX_LIQUIDATION_INCENTIVE_FACTOR` from `@morpho-org/morpho-sdk/constants`
  - `MAX_SLIPPAGE_TOLERANCE` from `@morpho-org/morpho-sdk/constants`
  - `MAX_TOKEN_APPROVALS` from `@morpho-org/morpho-sdk/constants`
  - `MORPHO_DOMAIN` from `@morpho-org/morpho-sdk/constants`
  - `OPTIMIZERS_API_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `OPTIMIZERS_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `ORACLE_PRICE_SCALE` from `@morpho-org/morpho-sdk/constants`
  - `REWARDS_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `SECONDS_PER_YEAR` from `@morpho-org/morpho-sdk/constants`
  - `TransactionType` from `@morpho-org/morpho-sdk/constants`
  - `ZERO_ADDRESS` from `@morpho-org/morpho-sdk/constants`

  New entity imports from `@morpho-org/morpho-sdk/entities`:

  - `AccrualPosition` from `@morpho-org/morpho-sdk/entities`
  - `AccrualVault` from `@morpho-org/morpho-sdk/entities`
  - `AccrualVaultV2` from `@morpho-org/morpho-sdk/entities`
  - `AccrualVaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `AccrualVaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/entities`
  - `AccrualVaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `AssetBalances` from `@morpho-org/morpho-sdk/entities`
  - `ConstantWrappedToken` from `@morpho-org/morpho-sdk/entities`
  - `Eip5267Domain` from `@morpho-org/morpho-sdk/entities`
  - `ExchangeRateWrappedToken` from `@morpho-org/morpho-sdk/entities`
  - `Holding` from `@morpho-org/morpho-sdk/entities`
  - `Market` from `@morpho-org/morpho-sdk/entities`
  - `MarketParams` from `@morpho-org/morpho-sdk/entities`
  - `MorphoMarketV1` from `@morpho-org/morpho-sdk/entities`
  - `MorphoVaultV1` from `@morpho-org/morpho-sdk/entities`
  - `MorphoVaultV2` from `@morpho-org/morpho-sdk/entities`
  - `Position` from `@morpho-org/morpho-sdk/entities`
  - `PreLiquidationParams` from `@morpho-org/morpho-sdk/entities`
  - `PreLiquidationPosition` from `@morpho-org/morpho-sdk/entities`
  - `ReallocationData` from `@morpho-org/morpho-sdk/entities`
  - `Token` from `@morpho-org/morpho-sdk/entities`
  - `User` from `@morpho-org/morpho-sdk/entities`
  - `Vault` from `@morpho-org/morpho-sdk/entities`
  - `VaultConfig` from `@morpho-org/morpho-sdk/entities`
  - `VaultMarketAllocation` from `@morpho-org/morpho-sdk/entities`
  - `VaultMarketConfig` from `@morpho-org/morpho-sdk/entities`
  - `VaultMarketPublicAllocatorConfig` from `@morpho-org/morpho-sdk/entities`
  - `VaultToken` from `@morpho-org/morpho-sdk/entities`
  - `VaultUser` from `@morpho-org/morpho-sdk/entities`
  - `VaultV2` from `@morpho-org/morpho-sdk/entities`
  - `VaultV2Adapter` from `@morpho-org/morpho-sdk/entities`
  - `VaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `VaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/entities`
  - `VaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `WrappedToken` from `@morpho-org/morpho-sdk/entities`

  New entity type imports from `@morpho-org/morpho-sdk/entities`:

  - `IAccrualPosition` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVault` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVaultV2` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVaultV2Adapter` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `IAssetBalances` from `@morpho-org/morpho-sdk/entities`
  - `IEip5267Domain` from `@morpho-org/morpho-sdk/entities`
  - `IHolding` from `@morpho-org/morpho-sdk/entities`
  - `IMarket` from `@morpho-org/morpho-sdk/entities`
  - `IMarketParams` from `@morpho-org/morpho-sdk/entities`
  - `InputReallocationData` from `@morpho-org/morpho-sdk/entities`
  - `IPosition` from `@morpho-org/morpho-sdk/entities`
  - `IPreLiquidationParams` from `@morpho-org/morpho-sdk/entities`
  - `IPreLiquidationPosition` from `@morpho-org/morpho-sdk/entities`
  - `IToken` from `@morpho-org/morpho-sdk/entities`
  - `IVault` from `@morpho-org/morpho-sdk/entities`
  - `IVaultConfig` from `@morpho-org/morpho-sdk/entities`
  - `IVaultMarketAllocation` from `@morpho-org/morpho-sdk/entities`
  - `IVaultMarketConfig` from `@morpho-org/morpho-sdk/entities`
  - `IVaultMarketPublicAllocatorConfig` from `@morpho-org/morpho-sdk/entities`
  - `IVaultToken` from `@morpho-org/morpho-sdk/entities`
  - `IVaultUser` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2Adapter` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2Allocation` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `PeripheralBalance` from `@morpho-org/morpho-sdk/entities`
  - `PeripheralBalanceType` from `@morpho-org/morpho-sdk/entities`
  - `VaultPublicAllocatorConfig` from `@morpho-org/morpho-sdk/entities`

  New fetch imports from `@morpho-org/morpho-sdk/fetch`:

  - `fetchAccrualPosition` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVault` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVaultV2` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVaultV2Adapter` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/fetch`
  - `fetchHolding` from `@morpho-org/morpho-sdk/fetch`
  - `fetchMarket` from `@morpho-org/morpho-sdk/fetch`
  - `fetchMarketParams` from `@morpho-org/morpho-sdk/fetch`
  - `fetchPosition` from `@morpho-org/morpho-sdk/fetch`
  - `fetchPreLiquidationParams` from `@morpho-org/morpho-sdk/fetch`
  - `fetchPreLiquidationPosition` from `@morpho-org/morpho-sdk/fetch`
  - `fetchToken` from `@morpho-org/morpho-sdk/fetch`
  - `fetchUser` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVault` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultConfig` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultMarketAllocation` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultMarketConfig` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultMarketPublicAllocatorConfig` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultUser` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultV2` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultV2Adapter` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/fetch`

  New format imports from `@morpho-org/morpho-sdk/format`:

  - `BaseFormatter` from `@morpho-org/morpho-sdk/format`
  - `CommasFormatter` from `@morpho-org/morpho-sdk/format`
  - `CommonFormatter` from `@morpho-org/morpho-sdk/format`
  - `convertNumStrFromEffectiveTo` from `@morpho-org/morpho-sdk/format`
  - `convertNumStrToLocal` from `@morpho-org/morpho-sdk/format`
  - `createFormat` from `@morpho-org/morpho-sdk/format`
  - `Format` from `@morpho-org/morpho-sdk/format`
  - `format` from `@morpho-org/morpho-sdk/format`
  - `formatEnumeration` from `@morpho-org/morpho-sdk/format`
  - `formatLongString` from `@morpho-org/morpho-sdk/format`
  - `formatUnion` from `@morpho-org/morpho-sdk/format`
  - `getEffectiveLocale` from `@morpho-org/morpho-sdk/format`
  - `getEnUSNumberToLocalParts` from `@morpho-org/morpho-sdk/format`
  - `getLocaleSymbols` from `@morpho-org/morpho-sdk/format`
  - `HexFormatter` from `@morpho-org/morpho-sdk/format`
  - `LocaleParts` from `@morpho-org/morpho-sdk/format`
  - `NumberFormatter` from `@morpho-org/morpho-sdk/format`
  - `PercentFormatter` from `@morpho-org/morpho-sdk/format`
  - `ShortFormatter` from `@morpho-org/morpho-sdk/format`

  New ABI imports from `@morpho-org/morpho-sdk/abis`:

  - `aaveV2MigrationAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `aaveV3MigrationAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `aaveV3OptimizerMigrationAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `adaptiveCurveIrmAbi` from `@morpho-org/morpho-sdk/abis`
  - `blueAbi` from `@morpho-org/morpho-sdk/abis`
  - `blueOracleAbi` from `@morpho-org/morpho-sdk/abis`
  - `bundler3Abi` from `@morpho-org/morpho-sdk/abis`
  - `compoundV2MigrationAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `compoundV3MigrationAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `coreAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `erc20WrapperAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `erc2612Abi` from `@morpho-org/morpho-sdk/abis`
  - `erc5267Abi` from `@morpho-org/morpho-sdk/abis`
  - `ethereumGeneralAdapter1Abi` from `@morpho-org/morpho-sdk/abis`
  - `generalAdapter1Abi` from `@morpho-org/morpho-sdk/abis`
  - `marketParamsAbi` from `@morpho-org/morpho-sdk/abis`
  - `metaMorphoAbi` from `@morpho-org/morpho-sdk/abis`
  - `metaMorphoFactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `morphoMarketV1AdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `morphoMarketV1AdapterFactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `morphoMarketV1AdapterV2Abi` from `@morpho-org/morpho-sdk/abis`
  - `morphoMarketV1AdapterV2FactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `morphoVaultV1AdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `morphoVaultV1AdapterFactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `paraswapAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `permissionedErc20WrapperAbi` from `@morpho-org/morpho-sdk/abis`
  - `permit2Abi` from `@morpho-org/morpho-sdk/abis`
  - `preLiquidationAbi` from `@morpho-org/morpho-sdk/abis`
  - `preLiquidationFactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `publicAllocatorAbi` from `@morpho-org/morpho-sdk/abis`
  - `vaultV1AdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `vaultV1AdapterFactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `vaultV2Abi` from `@morpho-org/morpho-sdk/abis`
  - `vaultV2FactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `whitelistControllerAggregatorV2Abi` from `@morpho-org/morpho-sdk/abis`
  - `wrappedBackedTokenAbi` from `@morpho-org/morpho-sdk/abis`
  - `wstEthAbi` from `@morpho-org/morpho-sdk/abis`

  New utility imports from `@morpho-org/morpho-sdk/utils`:

  - `AdaptiveCurveIrmLib` from `@morpho-org/morpho-sdk/utils`
  - `addTransactionMetadata` from `@morpho-org/morpho-sdk/utils`
  - `ArrayElementType` from `@morpho-org/morpho-sdk/utils`
  - `bigIntComparator` from `@morpho-org/morpho-sdk/utils`
  - `CapacityLimit` from `@morpho-org/morpho-sdk/utils`
  - `CapacityLimitReason` from `@morpho-org/morpho-sdk/utils`
  - `computeMaxRepaySharePrice` from `@morpho-org/morpho-sdk/utils`
  - `computeMinBorrowSharePrice` from `@morpho-org/morpho-sdk/utils`
  - `computeReallocations` from `@morpho-org/morpho-sdk/utils`
  - `createGetValue` from `@morpho-org/morpho-sdk/utils`
  - `createHasValue` from `@morpho-org/morpho-sdk/utils`
  - `decodeBytes32String` from `@morpho-org/morpho-sdk/utils`
  - `deepFreeze` from `@morpho-org/morpho-sdk/utils`
  - `DeepPartial` from `@morpho-org/morpho-sdk/utils`
  - `DottedKeys` from `@morpho-org/morpho-sdk/utils`
  - `entries` from `@morpho-org/morpho-sdk/utils`
  - `FieldType` from `@morpho-org/morpho-sdk/utils`
  - `filterDefined` from `@morpho-org/morpho-sdk/utils`
  - `fromEntries` from `@morpho-org/morpho-sdk/utils`
  - `getAuthorizationTypedData` from `@morpho-org/morpho-sdk/utils`
  - `getDaiPermitTypedData` from `@morpho-org/morpho-sdk/utils`
  - `getLast` from `@morpho-org/morpho-sdk/utils`
  - `getLastDefined` from `@morpho-org/morpho-sdk/utils`
  - `getPermit2PermitTypedData` from `@morpho-org/morpho-sdk/utils`
  - `getPermit2TransferFromTypedData` from `@morpho-org/morpho-sdk/utils`
  - `getPermitTypedData` from `@morpho-org/morpho-sdk/utils`
  - `getSubdomainBaseUrl` from `@morpho-org/morpho-sdk/utils`
  - `getValue` from `@morpho-org/morpho-sdk/utils`
  - `hasValue` from `@morpho-org/morpho-sdk/utils`
  - `isDefined` from `@morpho-org/morpho-sdk/utils`
  - `isNotNull` from `@morpho-org/morpho-sdk/utils`
  - `isNotUndefined` from `@morpho-org/morpho-sdk/utils`
  - `keys` from `@morpho-org/morpho-sdk/utils`
  - `MarketUtils` from `@morpho-org/morpho-sdk/utils`
  - `mergeEntries` from `@morpho-org/morpho-sdk/utils`
  - `MathLib` from `@morpho-org/morpho-sdk/utils`
  - `optionalBoolean` from `@morpho-org/morpho-sdk/utils`
  - `PartialDottedKeys` from `@morpho-org/morpho-sdk/utils`
  - `readContractRestructured` from `@morpho-org/morpho-sdk/utils`
  - `retryPromiseLinearBackoff` from `@morpho-org/morpho-sdk/utils`
  - `restructure` from `@morpho-org/morpho-sdk/utils`
  - `safeGetAddress` from `@morpho-org/morpho-sdk/utils`
  - `safeParseNumber` from `@morpho-org/morpho-sdk/utils`
  - `safeParseUnits` from `@morpho-org/morpho-sdk/utils`
  - `RoundingDirection` from `@morpho-org/morpho-sdk/utils`
  - `SharesMath` from `@morpho-org/morpho-sdk/utils`
  - `Time` from `@morpho-org/morpho-sdk/utils`
  - `transformValue` from `@morpho-org/morpho-sdk/utils`
  - `validateAccrualPosition` from `@morpho-org/morpho-sdk/utils`
  - `validateChainId` from `@morpho-org/morpho-sdk/utils`
  - `validateNativeCollateral` from `@morpho-org/morpho-sdk/utils`
  - `validatePositionHealth` from `@morpho-org/morpho-sdk/utils`
  - `validatePositionHealthAfterWithdraw` from `@morpho-org/morpho-sdk/utils`
  - `validateReallocations` from `@morpho-org/morpho-sdk/utils`
  - `validateRepayAmount` from `@morpho-org/morpho-sdk/utils`
  - `validateRepayParams` from `@morpho-org/morpho-sdk/utils`
  - `validateRepayShares` from `@morpho-org/morpho-sdk/utils`
  - `validateSlippageTolerance` from `@morpho-org/morpho-sdk/utils`
  - `validateUserAddress` from `@morpho-org/morpho-sdk/utils`
  - `VaultUtils` from `@morpho-org/morpho-sdk/utils`
  - `values` from `@morpho-org/morpho-sdk/utils`
  - `WithId` from `@morpho-org/morpho-sdk/utils`
  - `WithIndex` from `@morpho-org/morpho-sdk/utils`

  New augmentation imports:

  - side-effect import `@morpho-org/morpho-sdk/augment` to augment every supported symbol
  - `AccrualPosition` from `@morpho-org/morpho-sdk/augment/AccrualPosition`
  - `AccrualVault` from `@morpho-org/morpho-sdk/augment/AccrualVault`
  - `Holding` from `@morpho-org/morpho-sdk/augment/Holding`
  - `Market` from `@morpho-org/morpho-sdk/augment/Market`
  - `MarketParams` from `@morpho-org/morpho-sdk/augment/MarketParams`
  - `Position` from `@morpho-org/morpho-sdk/augment/Position`
  - `Token` from `@morpho-org/morpho-sdk/augment/Token`
  - `User` from `@morpho-org/morpho-sdk/augment/User`
  - `Vault` from `@morpho-org/morpho-sdk/augment/Vault`
  - `VaultConfig` from `@morpho-org/morpho-sdk/augment/VaultConfig`
  - `VaultMarketAllocation` from `@morpho-org/morpho-sdk/augment/VaultMarketAllocation`
  - `VaultMarketConfig` from `@morpho-org/morpho-sdk/augment/VaultMarketConfig`
  - `VaultMarketPublicAllocatorConfig` from `@morpho-org/morpho-sdk/augment/VaultMarketPublicAllocatorConfig`
  - `VaultUser` from `@morpho-org/morpho-sdk/augment/VaultUser`

  Remove the formatter's String prototype mutation so the morpho-sdk utils entrypoint can re-export morpho-ts utilities without adding a top-level side effect.

  `ReallocationData` and `InputReallocationData` are intentionally exposed from `@morpho-org/morpho-sdk/entities`. Moving them there is not a breaking change in this re-export changeset because they are introduced by the pending `extract-public-reallocation-data` changeset and have not been published as root-level `morpho-sdk` imports.
