---
"@morpho-org/morpho-sdk": minor
"@morpho-org/morpho-ts": patch
---

Re-export consolidated blue-sdk, blue-sdk-viem, and utility surfaces from morpho-sdk through canonical root and subpath entrypoints.

New root imports from `@morpho-org/morpho-sdk`:

- `AdaptiveCurveIrmLib` from `@morpho-org/morpho-sdk`
- `getAuthorizationTypedData` from `@morpho-org/morpho-sdk`
- `getDaiPermitTypedData` from `@morpho-org/morpho-sdk`
- `getPermit2PermitTypedData` from `@morpho-org/morpho-sdk`
- `getPermit2TransferFromTypedData` from `@morpho-org/morpho-sdk`
- `getPermitTypedData` from `@morpho-org/morpho-sdk`
- `MathLib` from `@morpho-org/morpho-sdk`
- `SharesMath` from `@morpho-org/morpho-sdk`

New root type imports from `@morpho-org/morpho-sdk`:

- `Address` from `@morpho-org/morpho-sdk`
- `BigIntish` from `@morpho-org/morpho-sdk`
- `ChainMetadata` from `@morpho-org/morpho-sdk`
- `DeploylessFetchParameters` from `@morpho-org/morpho-sdk`
- `Failable` from `@morpho-org/morpho-sdk`
- `Fetchable` from `@morpho-org/morpho-sdk`
- `FetchParameters` from `@morpho-org/morpho-sdk`
- `Loadable` from `@morpho-org/morpho-sdk`
- `MarketId` from `@morpho-org/morpho-sdk`
- `RoundingDirection` from `@morpho-org/morpho-sdk`

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

- `ChainId` from `@morpho-org/morpho-sdk/constants`
- `ChainUtils` from `@morpho-org/morpho-sdk/constants`
- `DEFAULT_SLIPPAGE_TOLERANCE` from `@morpho-org/morpho-sdk/constants`
- `EIP_712_FIELDS` from `@morpho-org/morpho-sdk/constants`
- `isMarketId` from `@morpho-org/morpho-sdk/constants`
- `LIQUIDATION_CURSOR` from `@morpho-org/morpho-sdk/constants`
- `MAX_LIQUIDATION_INCENTIVE_FACTOR` from `@morpho-org/morpho-sdk/constants`
- `ORACLE_PRICE_SCALE` from `@morpho-org/morpho-sdk/constants`
- `SECONDS_PER_YEAR` from `@morpho-org/morpho-sdk/constants`
- `TransactionType` from `@morpho-org/morpho-sdk/constants`

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
- `MarketUtils` from `@morpho-org/morpho-sdk/entities`
- `MorphoMarketV1` from `@morpho-org/morpho-sdk/entities`
- `MorphoVaultV1` from `@morpho-org/morpho-sdk/entities`
- `MorphoVaultV2` from `@morpho-org/morpho-sdk/entities`
- `Position` from `@morpho-org/morpho-sdk/entities`
- `PreLiquidationParams` from `@morpho-org/morpho-sdk/entities`
- `PreLiquidationPosition` from `@morpho-org/morpho-sdk/entities`
- `Token` from `@morpho-org/morpho-sdk/entities`
- `User` from `@morpho-org/morpho-sdk/entities`
- `Vault` from `@morpho-org/morpho-sdk/entities`
- `VaultConfig` from `@morpho-org/morpho-sdk/entities`
- `VaultMarketAllocation` from `@morpho-org/morpho-sdk/entities`
- `VaultMarketConfig` from `@morpho-org/morpho-sdk/entities`
- `VaultMarketPublicAllocatorConfig` from `@morpho-org/morpho-sdk/entities`
- `VaultToken` from `@morpho-org/morpho-sdk/entities`
- `VaultUser` from `@morpho-org/morpho-sdk/entities`
- `VaultUtils` from `@morpho-org/morpho-sdk/entities`
- `VaultV2` from `@morpho-org/morpho-sdk/entities`
- `VaultV2Adapter` from `@morpho-org/morpho-sdk/entities`
- `VaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/entities`
- `VaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/entities`
- `VaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/entities`
- `WrappedToken` from `@morpho-org/morpho-sdk/entities`

New entity type imports from `@morpho-org/morpho-sdk/entities`:

- `CollateralAllocation` from `@morpho-org/morpho-sdk/entities`
- `Eip712Field` from `@morpho-org/morpho-sdk/entities`
- `Erc20AllowanceRecipient` from `@morpho-org/morpho-sdk/entities`
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
- `InputMarketParams` from `@morpho-org/morpho-sdk/entities`
- `IPermit2Allowance` from `@morpho-org/morpho-sdk/entities`
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
- `MarketV1Actions` from `@morpho-org/morpho-sdk/entities`
- `MaxBorrowOptions` from `@morpho-org/morpho-sdk/entities`
- `MaxPositionCapacities` from `@morpho-org/morpho-sdk/entities`
- `MaxWithdrawCollateralOptions` from `@morpho-org/morpho-sdk/entities`
- `Pending` from `@morpho-org/morpho-sdk/entities`
- `PeripheralBalance` from `@morpho-org/morpho-sdk/entities`
- `PeripheralBalanceType` from `@morpho-org/morpho-sdk/entities`
- `Permit2Allowance` from `@morpho-org/morpho-sdk/entities`
- `VaultPublicAllocatorConfig` from `@morpho-org/morpho-sdk/entities`
- `VaultV1Actions` from `@morpho-org/morpho-sdk/entities`
- `VaultV2Actions` from `@morpho-org/morpho-sdk/entities`

New fetch imports from `@morpho-org/morpho-sdk/fetch`:

- `decodeBytes32String` from `@morpho-org/morpho-sdk/fetch`
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
- `optionalBoolean` from `@morpho-org/morpho-sdk/fetch`

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
- `universalRewardsDistributorAbi` from `@morpho-org/morpho-sdk/abis`
- `vaultV1AdapterAbi` from `@morpho-org/morpho-sdk/abis`
- `vaultV1AdapterFactoryAbi` from `@morpho-org/morpho-sdk/abis`
- `vaultV2Abi` from `@morpho-org/morpho-sdk/abis`
- `vaultV2FactoryAbi` from `@morpho-org/morpho-sdk/abis`
- `whitelistControllerAggregatorV2Abi` from `@morpho-org/morpho-sdk/abis`
- `wrappedBackedTokenAbi` from `@morpho-org/morpho-sdk/abis`
- `wstEthAbi` from `@morpho-org/morpho-sdk/abis`

New utility imports from `@morpho-org/morpho-sdk/utils`:

- `addTransactionMetadata` from `@morpho-org/morpho-sdk/utils`
- `APPROVE_ONLY_ONCE_TOKENS` from `@morpho-org/morpho-sdk/utils`
- `ArrayElementType` from `@morpho-org/morpho-sdk/utils`
- `BaseFormatter` from `@morpho-org/morpho-sdk/utils`
- `bigIntComparator` from `@morpho-org/morpho-sdk/utils`
- `BLUE_API_BASE_URL` from `@morpho-org/morpho-sdk/utils`
- `BLUE_API_GRAPHQL_URL` from `@morpho-org/morpho-sdk/utils`
- `CapacityLimit` from `@morpho-org/morpho-sdk/utils`
- `CapacityLimitReason` from `@morpho-org/morpho-sdk/utils`
- `CDN_BASE_URL` from `@morpho-org/morpho-sdk/utils`
- `CommasFormatter` from `@morpho-org/morpho-sdk/utils`
- `CommonFormatter` from `@morpho-org/morpho-sdk/utils`
- `computeMaxRepaySharePrice` from `@morpho-org/morpho-sdk/utils`
- `computeMinBorrowSharePrice` from `@morpho-org/morpho-sdk/utils`
- `computeReallocations` from `@morpho-org/morpho-sdk/utils`
- `convertNumStrFromEffectiveTo` from `@morpho-org/morpho-sdk/utils`
- `convertNumStrToLocal` from `@morpho-org/morpho-sdk/utils`
- `createFormat` from `@morpho-org/morpho-sdk/utils`
- `createGetValue` from `@morpho-org/morpho-sdk/utils`
- `createHasValue` from `@morpho-org/morpho-sdk/utils`
- `DEFAULT_LLTV_BUFFER` from `@morpho-org/morpho-sdk/utils`
- `DEFAULT_SUPPLY_TARGET_UTILIZATION` from `@morpho-org/morpho-sdk/utils`
- `DEFAULT_WITHDRAWAL_TARGET_UTILIZATION` from `@morpho-org/morpho-sdk/utils`
- `deepFreeze` from `@morpho-org/morpho-sdk/utils`
- `DeepPartial` from `@morpho-org/morpho-sdk/utils`
- `DOCS_BASE_URL` from `@morpho-org/morpho-sdk/utils`
- `DottedKeys` from `@morpho-org/morpho-sdk/utils`
- `entries` from `@morpho-org/morpho-sdk/utils`
- `FieldType` from `@morpho-org/morpho-sdk/utils`
- `filterDefined` from `@morpho-org/morpho-sdk/utils`
- `Format` from `@morpho-org/morpho-sdk/utils`
- `format` from `@morpho-org/morpho-sdk/utils`
- `formatEnumeration` from `@morpho-org/morpho-sdk/utils`
- `formatLongString` from `@morpho-org/morpho-sdk/utils`
- `formatUnion` from `@morpho-org/morpho-sdk/utils`
- `fromEntries` from `@morpho-org/morpho-sdk/utils`
- `getEffectiveLocale` from `@morpho-org/morpho-sdk/utils`
- `getEnUSNumberToLocalParts` from `@morpho-org/morpho-sdk/utils`
- `getLast` from `@morpho-org/morpho-sdk/utils`
- `getLastDefined` from `@morpho-org/morpho-sdk/utils`
- `getLocaleSymbols` from `@morpho-org/morpho-sdk/utils`
- `getSubdomainBaseUrl` from `@morpho-org/morpho-sdk/utils`
- `getValue` from `@morpho-org/morpho-sdk/utils`
- `hasValue` from `@morpho-org/morpho-sdk/utils`
- `HexFormatter` from `@morpho-org/morpho-sdk/utils`
- `InputReallocationData` from `@morpho-org/morpho-sdk/utils`
- `isDefined` from `@morpho-org/morpho-sdk/utils`
- `isNotNull` from `@morpho-org/morpho-sdk/utils`
- `isNotUndefined` from `@morpho-org/morpho-sdk/utils`
- `keys` from `@morpho-org/morpho-sdk/utils`
- `LocaleParts` from `@morpho-org/morpho-sdk/utils`
- `MAX_ABSOLUTE_SHARE_PRICE` from `@morpho-org/morpho-sdk/utils`
- `MAX_SLIPPAGE_TOLERANCE` from `@morpho-org/morpho-sdk/utils`
- `MAX_TOKEN_APPROVALS` from `@morpho-org/morpho-sdk/utils`
- `mergeEntries` from `@morpho-org/morpho-sdk/utils`
- `MORPHO_DOMAIN` from `@morpho-org/morpho-sdk/utils`
- `NumberFormatter` from `@morpho-org/morpho-sdk/utils`
- `OPTIMIZERS_API_BASE_URL` from `@morpho-org/morpho-sdk/utils`
- `OPTIMIZERS_BASE_URL` from `@morpho-org/morpho-sdk/utils`
- `PartialDottedKeys` from `@morpho-org/morpho-sdk/utils`
- `PercentFormatter` from `@morpho-org/morpho-sdk/utils`
- `readContractRestructured` from `@morpho-org/morpho-sdk/utils`
- `ReallocationData` from `@morpho-org/morpho-sdk/utils`
- `REWARDS_BASE_URL` from `@morpho-org/morpho-sdk/utils`
- `retryPromiseLinearBackoff` from `@morpho-org/morpho-sdk/utils`
- `restructure` from `@morpho-org/morpho-sdk/utils`
- `safeGetAddress` from `@morpho-org/morpho-sdk/utils`
- `safeParseNumber` from `@morpho-org/morpho-sdk/utils`
- `safeParseUnits` from `@morpho-org/morpho-sdk/utils`
- `ShortFormatter` from `@morpho-org/morpho-sdk/utils`
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
- `values` from `@morpho-org/morpho-sdk/utils`
- `WithId` from `@morpho-org/morpho-sdk/utils`
- `WithIndex` from `@morpho-org/morpho-sdk/utils`
- `ZERO_ADDRESS` from `@morpho-org/morpho-sdk/utils`

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
