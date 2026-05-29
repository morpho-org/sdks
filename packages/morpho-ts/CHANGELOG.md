# @morpho-org/morpho-ts

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
