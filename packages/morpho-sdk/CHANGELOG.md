# @morpho-org/morpho-sdk

## 3.1.0

### Minor Changes

- [#684](https://github.com/morpho-org/sdks/pull/684) [`49b24e7`](https://github.com/morpho-org/sdks/commit/49b24e7e8ffc9e1ff6ea1381b81873de7cccdd83) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Adds `morphoSupply` and `morphoWithdraw` to the local Bundler3 action subset (action types, encoder functions, and `encode` dispatch), used by `marketV1Supply` / `marketV1Withdraw`. This keeps `@morpho-org/bundler-sdk-viem` a devDependency only — the published `morpho-sdk` tarball no longer imports it at runtime.

- [#684](https://github.com/morpho-org/sdks/pull/684) [`49b24e7`](https://github.com/morpho-org/sdks/commit/49b24e7e8ffc9e1ff6ea1381b81873de7cccdd83) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add `marketV1Supply` and `marketV1Withdraw` for the loan asset of a Morpho Blue market, routed through bundler3 / GeneralAdapter1. `marketV1Supply` mirrors `marketV1SupplyCollateral` with `maxSharePrice` (anti-inflation) and optional native wrapping when `loanToken === wNative`. `marketV1Withdraw` mirrors `marketV1Borrow` with `minSharePrice` (slippage) and optional PublicAllocator reallocations to top up market liquidity. Withdraw is signer-bound (no `onBehalf` arg; the bundler uses the transaction initiator, matching `marketV1Borrow`); it supports both `assets` and `shares` modes (via the new generic `AssetsOrSharesArgs` type; `RepayAmountArgs` kept as a deprecated alias). New entity methods `MorphoMarketV1.supply()` (validates `marketData.id === marketParams.id`) and `MorphoMarketV1.withdraw()` expose the same surface. `computeReallocations` takes a canonical `{ operation: "borrow" | "withdraw", amount }` shape (single source of truth for shared-liquidity planning); `MorphoMarketV1.getReallocations` keeps a `{ borrowAmount }` alias for back-compat at the entity boundary. Merges `validateNativeCollateral` and `validateNativeLoan` into a single action-agnostic `validateNativeAsset(chainId, asset)`; the corresponding error class is now `NativeAmountOnNonWNativeAssetError` (`NativeAmountOnNonWNativeCollateralError` is kept as a deprecated alias). New typed errors: `NegativeSupplyAmountError`, `NegativeSupplyMaxSharePriceError`, `ZeroSupplyAmountError`, `NonPositiveWithdrawAmountError`, `NegativeWithdrawMinSharePriceError`, `MutuallyExclusiveWithdrawAmountsError`, `WithdrawExceedsSupplyError`, `WithdrawSharesExceedSupplyError`, `ReallocationWithdrawExceedsMarketSupplyError` (raised by `computeReallocations` when a `"withdraw"` `amount` exceeds the target market's total supply — blocks fee-bearing reallocations on an on-chain-unreachable call).

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

- Updated dependencies [[`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7)]:
  - @morpho-org/blue-sdk@6.0.1
  - @morpho-org/blue-sdk-viem@5.0.1
  - @morpho-org/morpho-ts@2.5.3

## 3.0.0

### Major Changes

- [#655](https://github.com/morpho-org/sdks/pull/655) [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Replace public allocator planning inputs with `ReallocationData`, moving reallocation computation off `simulation-sdk` state and adding explicit timestamp-driven reallocation options.

  `ReallocationData.getMarketPublicReallocations` does not carry over the legacy `SimulationState.getMarketPublicReallocations` one-hour `delay` margin. It evaluates target-market vault headroom at `options.timestamp` (or the target market's `lastUpdate` when omitted), so callers that need inclusion-time safety should pass a future timestamp or reserve their own headroom.

### Minor Changes

- [#655](https://github.com/morpho-org/sdks/pull/655) [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Extract the Bundler3 action encoding surface needed by morpho-sdk so it no longer depends on @morpho-org/bundler-sdk-viem.

  `BundlerAction.encodeBundle` now computes the native `tx.value` required by value-carrying Bundler3 calls, including `reallocateTo` fees in top-level and callback actions.

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

### Patch Changes

- Updated dependencies [[`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0)]:
  - @morpho-org/morpho-ts@2.5.2

## 2.1.1

### Patch Changes

- [#596](https://github.com/morpho-org/sdks/pull/596) [`79443e5`](https://github.com/morpho-org/sdks/commit/79443e5814e939428b7e5bbeb30729903305cf81) Thanks [@0xbulma](https://github.com/0xbulma)! - `addTransactionMetadata` now strips a leading `"0x"` from `metadata.origin` before validating and appending it. Previously, passing `"0xcafe"` and `"cafe"` produced different calldata: `"0xcafe"` was rejected by the upstream `isHex` check (which receives the raw fragment) while `"cafe"` was accepted. With this change, both inputs produce the same 4-byte origin appended to `tx.data`. Length validation (max 8 hex chars) is applied to the raw fragment, so `"0xdeadbeef00"` (10 raw hex chars) is still rejected.

## 2.1.0

### Minor Changes

- [#677](https://github.com/morpho-org/sdks/pull/677) [`0f71108`](https://github.com/morpho-org/sdks/commit/0f71108d40854e1bb9186e52c6ce94aa4ab91912) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Export `getRequirementsAction` on the public surface. The helper encodes a pre-signed permit / permit2 requirement followed by a transfer to an arbitrary `recipient`, and was previously `@internal` (reachable only via deep dist paths). Exposing it lets action builders outside this package — e.g. the Aave V3 → Vault V2 migration in `morpho-apps` — route the pulled asset to a non-default recipient such as `AaveV3CoreMigrationAdapter`, without copying the permit/permit2 encoding logic.

  Also exports `Permit2ExpirationMissingError`, the typed error `getRequirementsAction` now throws when a `permit2` requirement signature is missing `args.expiration` (previously a generic `Error`).

### Patch Changes

- [#578](https://github.com/morpho-org/sdks/pull/578) [`e27f9bd`](https://github.com/morpho-org/sdks/commit/e27f9bdffccdfe950104b0507c5252fa3d15ab27) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Fix MarketV1 share-mode `repay` and `repayWithdrawCollateral` reverting on dormant markets: `transferAmount` and `maxSharePrice` are now sized from the accrued market snapshot instead of the stale `lastUpdate` state, so full-repay matches its accrual-immune contract.

- [#681](https://github.com/morpho-org/sdks/pull/681) [`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - **`blue-sdk`** — Fix `VaultV2._wrap` / `_unwrap` (and everything layered on them: `toAssets`, `toShares`, `maxWithdraw`, plus `previewWithdrawShares` in `deallocation.ts`) overstating assets whenever management or performance fees are pending. The previous math paired **post-accrue** `totalAssets` (from `accrueInterestView`) with **pre-accrue** `totalSupply` (still missing the fee shares the next accrual will mint), overshooting the share price by `~ pendingFeeShares / totalSupply`. Conversions now pair stored `_totalAssets` with stored `totalSupply` — both pre-accrue, internally consistent. Call `AccrualVaultV2.accrueInterest(timestamp)` for post-accrue math; it rolls `_totalAssets` forward and mints pending fee shares into `totalSupply` atomically. `AccrualVaultV2.maxDeposit`'s relative-cap check now reads `_totalAssets` instead of `totalAssets`.

  **Breaking:** `VaultV2.totalAssets` is removed (it always equalled `_totalAssets` after the fix). Read `_totalAssets` instead.

  **`blue-sdk-viem`** — `fetchVaultV2` no longer calls `vault.totalAssets()` (deployless and multicall paths), saving one RPC read per fetch.

  **`morpho-sdk`** — `MorphoVaultV2.deposit` and `MorphoVaultV1.migrateToV2` previously sized `maxSharePrice` from `vaultData.toShares(amount)` directly. With the conversion fix above, that share count is now pre-accrue, so the bound was below the actual onchain share price at execution and every bundled deposit reverted with `SlippageExceeded` (`0x8199f5f3`) inside `GeneralAdapter1`. Both entities now forward-accrue the target VaultV2 by 2h before computing the bound, mirroring `MorphoMarketV1.repay`'s shares-mode pattern.

- Updated dependencies [[`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987)]:
  - @morpho-org/blue-sdk@6.0.0
  - @morpho-org/blue-sdk-viem@5.0.0
  - @morpho-org/simulation-sdk@4.0.0
  - @morpho-org/bundler-sdk-viem@5.0.0

## 2.0.0

### Major Changes

- [#631](https://github.com/morpho-org/sdks/pull/631) [`2520c09`](https://github.com/morpho-org/sdks/commit/2520c093ddbfb284805c02b375d35493e32d3f25) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Rename VaultV1 and VaultV2 deposit parameters from `accrualVault` to `vaultData`.

- [#666](https://github.com/morpho-org/sdks/pull/666) [`c4d5a28`](https://github.com/morpho-org/sdks/commit/c4d5a28120a1bf764478023720d8fc30b6e91286) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Stop hard-enforcing `userAddress` matches the connected client account on
  transaction builders. `MorphoMarketV1` (`supplyCollateral`, `borrow`,
  `repay`, `withdrawCollateral`, `repayWithdrawCollateral`,
  `supplyCollateralBorrow`) and `MorphoVaultV1.migrateToV2` no longer call
  `validateUserAddress` at the builder layer — callers may now build a tx
  for any `userAddress` regardless of the client's connected account (or
  with a public client that has no account at all).

  The builder = signer invariant is now enforced exclusively at `sign()`
  time on the signature requirements. `Requirement.sign` and
  `ERC20PermitAction.sign` are typed against viem's `WalletClient` instead
  of the more permissive `Client` — **this is a TypeScript-breaking
  surface change** and is the reason this release is marked `major`.
  Downstream code that previously passed a value typed as `Client` to
  `sign()` will no longer compile and must switch to a `WalletClient`
  (e.g. `createWalletClient(...)` or `publicClient.extend(walletActions)`).
  Runtime behavior is unchanged for callers already passing a wallet
  client with the matching account.

  `encodeErc20Permit` / `encodeErc20Permit2` call `validateUserAddress`
  internally to reject any `sign(client, userAddress)` where the client
  account is missing or differs from `userAddress` with
  `MissingClientPropertyError` / `AddressMismatchError`. Signing on behalf
  of a different address is the only path where the divergence is a real
  security concern, so the check stays exactly there.

  `validateUserAddress` remains exported from `@morpho-org/morpho-sdk` and
  is no longer dead code — it is the canonical check used by the signature
  requirements above.

### Minor Changes

- [#656](https://github.com/morpho-org/sdks/pull/656) [`5584ce5`](https://github.com/morpho-org/sdks/commit/5584ce5e5c70ef19d35304cc1e74b106a08821d7) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Deprecate `MorphoClient` in favor of `morphoViemExtension`. Extend a viem public (or wallet) client with `morphoViemExtension(...)` and use `client.morpho.vaultV1 / vaultV2 / marketV1` instead of constructing `MorphoClient` directly. `MorphoClient` will be removed in the next major release.

### Patch Changes

- [#654](https://github.com/morpho-org/sdks/pull/654) [`217ba29`](https://github.com/morpho-org/sdks/commit/217ba29c1a80284795a9d01250e55750ad9d0f00) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Internal: `getRequirementsAction` now takes the transfer recipient as an
  explicit `recipient` parameter instead of resolving it from `chainId`. The
  function is `@internal` and not part of the public surface; all in-repo
  callers (`marketV1` supply/repay paths, `vaultV1`/`vaultV2` deposit, and
  `vaultV1` migrate-to-v2) have been updated to pass `recipient: generalAdapter1`
  directly. No behavior change — same destination address, just no longer
  hard-coded inside the helper.

- [#648](https://github.com/morpho-org/sdks/pull/648) [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh packages that need a release after direct dependency, peer dependency, or source compatibility changes.

  - Update direct runtime dependency ranges for packages using `@noble/hashes`, `zod`, `@velora-dex/sdk`, `mutative`, `viem-deal`, and `viem-tracer`.
  - Widen React and TypeScript peer ranges in the Wagmi adapters only where the updated development dependencies require it, while preserving the previous lower-bound support.
  - Keep the SDK source compatible with the refreshed toolchain and libraries, including TypeScript 6, `@noble/hashes` 2.x subpath imports, TanStack Query/Wagmi inference changes, and viem error formatting; related tests/assertions were updated to match the refreshed dependencies.

- Updated dependencies [[`9dce8b7`](https://github.com/morpho-org/sdks/commit/9dce8b7047266badf7c7c813074a08f51ccb8c0a), [`81825a8`](https://github.com/morpho-org/sdks/commit/81825a8864d8c4228c8476380d1ad7e76a5ee1c0), [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e)]:
  - @morpho-org/blue-sdk@5.23.3
  - @morpho-org/blue-sdk-viem@4.6.6
  - @morpho-org/simulation-sdk@3.4.4
