import type { Address } from "@morpho-org/blue-sdk";
import type { MarketId } from "@morpho-org/blue-sdk";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  Address: { input: string; output: Address };
  BigInt: { input: string | number; output: bigint };
  HexString: { input: string; output: `0x${string}` };
  MarketId: { input: string; output: MarketId };
};

export type AddressDataPoint = {
  __typename?: "AddressDataPoint";
  x: Scalars["Float"]["output"];
  y: Maybe<Scalars["Address"]["output"]>;
};

export type AddressMetadata = {
  __typename?: "AddressMetadata";
  metadata: Metadata;
  type: AddressMetadataType;
};

export enum AddressMetadataType {
  Safe = "safe",
}

/** Asset */
export type Asset = {
  __typename?: "Asset";
  /** ERC-20 token contract address */
  address: Scalars["Address"]["output"];
  chain: Chain;
  decimals: Scalars["Float"]["output"];
  /** Historical price in USD, for display purpose */
  historicalPriceUsd: Maybe<Array<FloatDataPoint>>;
  /** Historical spot price in ETH */
  historicalSpotPriceEth: Maybe<Array<FloatDataPoint>>;
  id: Scalars["ID"]["output"];
  /** Either the asset is whitelisted or not */
  isWhitelisted: Scalars["Boolean"]["output"];
  /** Token logo URI, for display purpose */
  logoURI: Maybe<Scalars["String"]["output"]>;
  name: Scalars["String"]["output"];
  /** Current oracle price in USD, for display purpose. */
  oraclePriceUsd: Maybe<Scalars["Float"]["output"]>;
  /** Current price in USD, for display purpose. */
  priceUsd: Maybe<Scalars["Float"]["output"]>;
  /** Risk related data on the asset */
  riskAnalysis: Maybe<Array<RiskAnalysis>>;
  /** Current spot price in ETH. */
  spotPriceEth: Maybe<Scalars["Float"]["output"]>;
  symbol: Scalars["String"]["output"];
  tags: Maybe<Array<Scalars["String"]["output"]>>;
  /**
   * ERC-20 token total supply
   * @deprecated this data is not updated anymore
   */
  totalSupply: Scalars["BigInt"]["output"];
  /** MetaMorpho vault */
  vault: Maybe<Vault>;
  /** Asset yield */
  yield: Maybe<AssetYield>;
};

/** Asset */
export type AssetHistoricalPriceUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Asset */
export type AssetHistoricalSpotPriceEthArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Asset */
export type AssetOraclePriceUsdArgs = {
  timestamp?: InputMaybe<Scalars["Float"]["input"]>;
};

/** Asset */
export type AssetSpotPriceEthArgs = {
  timestamp?: InputMaybe<Scalars["Float"]["input"]>;
};

export enum AssetOrderBy {
  Address = "Address",
  CredoraRiskScore = "CredoraRiskScore",
}

/** Asset yield */
export type AssetYield = {
  __typename?: "AssetYield";
  /** Asset yield (APR) */
  apr: Scalars["Float"]["output"];
};

export type AssetsFilters = {
  /** Filter by token contract address. Case insensitive. */
  address_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  /** Filter by credora risk score greater than or equal to given value */
  credoraRiskScore_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by credora risk score lower than or equal to given value */
  credoraRiskScore_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by asset id */
  id_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter assets that are listed as collateral on at least one market */
  isCollateralAsset?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Filter assets that are listed as loan on at least one market */
  isLoanAsset?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Filter assets that are listed by at least one vault */
  isVaultAsset?: InputMaybe<Scalars["Boolean"]["input"]>;
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Filter by token symbol */
  symbol_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by token's tags */
  tags_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by whitelisted status */
  whitelisted?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type BigIntDataPoint = {
  __typename?: "BigIntDataPoint";
  x: Scalars["Float"]["output"];
  y: Maybe<Scalars["BigInt"]["output"]>;
};

export enum CacheControlScope {
  Private = "PRIVATE",
  Public = "PUBLIC",
}

/** Event data for cap-related operation */
export type CapEventData = {
  __typename?: "CapEventData";
  cap: Scalars["BigInt"]["output"];
  market: Market;
};

/** Chain */
export type Chain = {
  __typename?: "Chain";
  currency: Scalars["String"]["output"];
  id: Scalars["Int"]["output"];
  network: Scalars["String"]["output"];
};

/** Chain synchronization state */
export type ChainSynchronizationState = {
  __typename?: "ChainSynchronizationState";
  blockNumber: Scalars["BigInt"]["output"];
  chain: Chain;
  id: Scalars["ID"]["output"];
  key: Scalars["String"]["output"];
};

/** Oracle creation tx */
export type ChainlinkOracleV2Event = {
  __typename?: "ChainlinkOracleV2Event";
  blockNumber: Scalars["BigInt"]["output"];
  chainId: Scalars["Int"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  txHash: Scalars["HexString"]["output"];
};

/** Amount of collateral at risk of liquidation at collateralPriceRatio * oracle price */
export type CollateralAtRiskDataPoint = {
  __typename?: "CollateralAtRiskDataPoint";
  collateralAssets: Scalars["BigInt"]["output"];
  collateralPriceRatio: Scalars["Float"]["output"];
  collateralUsd: Scalars["Float"]["output"];
};

/** Vault curator */
export type Curator = {
  __typename?: "Curator";
  addresses: Maybe<Array<CuratorAddress>>;
  id: Scalars["ID"]["output"];
  /** Curator logo URI, for display purpose */
  image: Maybe<Scalars["String"]["output"]>;
  name: Scalars["String"]["output"];
  /** Current state */
  state: Maybe<CuratorState>;
  /** Link to curator website */
  url: Maybe<Scalars["String"]["output"]>;
  verified: Scalars["Boolean"]["output"];
};

/** Curator Address */
export type CuratorAddress = {
  __typename?: "CuratorAddress";
  address: Scalars["String"]["output"];
  chainId: Scalars["Int"]["output"];
  /** Additional information about the address. */
  metadata: Maybe<PaginatedAddressMetadata>;
};

/** Filtering options for curators. AND operator is used for multiple filters, while OR operator is used for multiple values in the same filter. */
export type CuratorFilters = {
  address_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
  search?: InputMaybe<Scalars["String"]["input"]>;
  verified?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Vault curator state */
export type CuratorState = {
  __typename?: "CuratorState";
  /**
   * Assets Under Management. Total assets managed by the curator, in USD for display purpose.
   * @deprecated Work in progress
   */
  aum: Scalars["Float"]["output"];
  curatorId: Scalars["ID"]["output"];
};

/** Custom Warning Metadata */
export type CustomMetadata = {
  __typename?: "CustomMetadata";
  content: Maybe<Scalars["String"]["output"]>;
};

export type FloatDataPoint = {
  __typename?: "FloatDataPoint";
  x: Scalars["Float"]["output"];
  y: Maybe<Scalars["Float"]["output"]>;
};

/** Hardcoded Price Metadata */
export type HardcodedPriceMetadata = {
  __typename?: "HardcodedPriceMetadata";
  symbolFrom: Maybe<Scalars["String"]["output"]>;
  symbolTo: Maybe<Scalars["String"]["output"]>;
};

/** IRM curve data point */
export type IrmCurveDataPoint = {
  __typename?: "IRMCurveDataPoint";
  /** Borrow APY at utilization rate */
  borrowApy: Scalars["Float"]["output"];
  /** Supply APY at utilization rate */
  supplyApy: Scalars["Float"]["output"];
  /** Market utilization rate */
  utilization: Scalars["Float"]["output"];
};

export type IntDataPoint = {
  __typename?: "IntDataPoint";
  x: Scalars["Float"]["output"];
  y: Maybe<Scalars["Int"]["output"]>;
};

/** Morpho Blue market */
export type Market = {
  __typename?: "Market";
  /** All time market APYs */
  allTimeApys: Maybe<MarketApyAggregates>;
  /** Market bad debt values */
  badDebt: Maybe<MarketBadDebt>;
  collateralAsset: Maybe<Asset>;
  /**
   * Amount of collateral to borrow 1 loan asset scaled to both asset decimals
   * @deprecated Use `state.price` instead.
   */
  collateralPrice: Maybe<Scalars["BigInt"]["output"]>;
  /** Market concentrations */
  concentration: Maybe<MarketConcentration>;
  creationBlockNumber: Scalars["Int"]["output"];
  creationTimestamp: Scalars["BigInt"]["output"];
  creatorAddress: Maybe<Scalars["Address"]["output"]>;
  /** Current IRM curve at different utilization thresholds for display purpose */
  currentIrmCurve: Maybe<Array<IrmCurveDataPoint>>;
  /** Daily market APYs */
  dailyApys: Maybe<MarketApyAggregates>;
  /** State history */
  historicalState: Maybe<MarketHistory>;
  id: Scalars["ID"]["output"];
  irmAddress: Scalars["Address"]["output"];
  lltv: Scalars["BigInt"]["output"];
  loanAsset: Asset;
  /** Monthly market APYs */
  monthlyApys: Maybe<MarketApyAggregates>;
  morphoBlue: MorphoBlue;
  oracle: Maybe<Oracle>;
  oracleAddress: Scalars["Address"]["output"];
  /** Feeds used by the oracle if provided by the contract */
  oracleFeed: Maybe<MarketOracleFeed>;
  /** Market oracle information */
  oracleInfo: Maybe<MarketOracleInfo>;
  /** Public allocator shared liquidity available reallocations */
  publicAllocatorSharedLiquidity: Maybe<Array<PublicAllocatorSharedLiquidity>>;
  /** Quarterly market APYs */
  quarterlyApys: Maybe<MarketApyAggregates>;
  /** Market realized bad debt values */
  realizedBadDebt: Maybe<MarketBadDebt>;
  /** Underlying amount of assets that can be reallocated to this market */
  reallocatableLiquidityAssets: Maybe<Scalars["BigInt"]["output"]>;
  /** Risk related data on the market */
  riskAnalysis: Maybe<Array<RiskAnalysis>>;
  /** Current state */
  state: Maybe<MarketState>;
  /** Vaults with the market in supply queue */
  supplyingVaults: Maybe<Array<Vault>>;
  targetBorrowUtilization: Scalars["BigInt"]["output"];
  targetWithdrawUtilization: Scalars["BigInt"]["output"];
  uniqueKey: Scalars["MarketId"]["output"];
  /** Market warnings */
  warnings: Maybe<Array<MarketWarning>>;
  /** Weekly market APYs */
  weeklyApys: Maybe<MarketApyAggregates>;
  whitelisted: Scalars["Boolean"]["output"];
  /** Yearly market APYs */
  yearlyApys: Maybe<MarketApyAggregates>;
};

/** Morpho Blue market */
export type MarketCurrentIrmCurveArgs = {
  numberOfPoints?: InputMaybe<Scalars["Float"]["input"]>;
};

/** Market APY aggregates */
export type MarketApyAggregates = {
  __typename?: "MarketApyAggregates";
  /** Average market borrow APY excluding rewards */
  borrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Average market borrow APY including rewards */
  netBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Average market supply APY including rewards */
  netSupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Average market supply APY excluding rewards */
  supplyApy: Maybe<Scalars["Float"]["output"]>;
};

/** Bad debt realized in the market */
export type MarketBadDebt = {
  __typename?: "MarketBadDebt";
  /** Amount of bad debt realized in the market in underlying units. */
  underlying: Scalars["BigInt"]["output"];
  /** Amount of bad debt realized in the market in USD. */
  usd: Maybe<Scalars["Float"]["output"]>;
};

/** Market collateral at risk of liquidation */
export type MarketCollateralAtRisk = {
  __typename?: "MarketCollateralAtRisk";
  /** Total collateral at risk of liquidation at certain prices thresholds. */
  collateralAtRisk: Maybe<Array<CollateralAtRiskDataPoint>>;
  market: Market;
};

/** Market collateral transfer transaction data */
export type MarketCollateralTransferTransactionData = {
  __typename?: "MarketCollateralTransferTransactionData";
  assets: Scalars["BigInt"]["output"];
  assetsUsd: Maybe<Scalars["Float"]["output"]>;
  market: Market;
};

/** Morpho Blue supply and borrow side concentrations */
export type MarketConcentration = {
  __typename?: "MarketConcentration";
  /** Borrowers Herfindahl-Hirschman Index */
  borrowHhi: Maybe<Scalars["Float"]["output"]>;
  /** Borrowers Herfindahl-Hirschman Index */
  supplyHhi: Maybe<Scalars["Float"]["output"]>;
};

/** Filtering options for markets. AND operator is used for multiple filters, while OR operator is used for multiple values in the same filter. */
export type MarketFilters = {
  /** Filter by greater than or equal to given apy at target utilization */
  apyAtTarget_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given apy at target utilization */
  apyAtTarget_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given borrow APY */
  borrowApy_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given borrow APY */
  borrowApy_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given borrow asset amount, in USD. */
  borrowAssetsUsd_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given borrow asset amount, in USD. */
  borrowAssetsUsd_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given borrow asset amount, in underlying token units. */
  borrowAssets_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given borrow asset amount, in underlying token units. */
  borrowAssets_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by greater than or equal to given borrow shares amount */
  borrowShares_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given borrow shares amount */
  borrowShares_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  /** Filter by collateral asset address. Case insensitive. */
  collateralAssetAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by collateral asset id */
  collateralAssetId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by collateral asset tags. */
  collateralAssetTags_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  countryCode?: InputMaybe<Scalars["String"]["input"]>;
  /** Filter by credora risk score greater than or equal to given value */
  credoraRiskScore_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by credora risk score lower than or equal to given value */
  credoraRiskScore_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given fee rate */
  fee_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given fee rate */
  fee_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by market id */
  id_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by market irm address */
  irmAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  isIdle?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Filter by greater than or equal to given lltv */
  lltv_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given lltv */
  lltv_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by loan asset address. Case insensitive. */
  loanAssetAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by loan asset id */
  loanAssetId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by loan asset tags. */
  loanAssetTags_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by greater than or equal to given net borrow APY */
  netBorrowApy_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given net borrow APY */
  netBorrowApy_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given net supply APY */
  netSupplyApy_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given net supply APY */
  netSupplyApy_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by market oracle address. Case insensitive. */
  oracleAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Filter by greater than or equal to given supply APY */
  supplyApy_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given supply APY */
  supplyApy_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given supply asset amount, in USD. */
  supplyAssetsUsd_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given supply asset amount, in USD. */
  supplyAssetsUsd_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given supply asset amount, in underlying token units. */
  supplyAssets_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given supply asset amount, in underlying token units. */
  supplyAssets_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by greater than or equal to given supply shares amount */
  supplyShares_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given borrow shares amount */
  supplyShares_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by market unique key */
  uniqueKey_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by greater than or equal to given utilization rate */
  utilization_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given utilization rate */
  utilization_lte?: InputMaybe<Scalars["Float"]["input"]>;
  whitelisted?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Market state history */
export type MarketHistory = {
  __typename?: "MarketHistory";
  /** All Time Borrow APY excluding rewards */
  allTimeBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** All Time Borrow APY including rewards */
  allTimeNetBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** All Time Supply APY including rewards */
  allTimeNetSupplyApy: Maybe<Array<FloatDataPoint>>;
  /** All Time Supply APY excluding rewards */
  allTimeSupplyApy: Maybe<Array<FloatDataPoint>>;
  /** AdaptiveCurveIRM APY if utilization was at target */
  apyAtTarget: Maybe<Array<FloatDataPoint>>;
  /** Borrow APY excluding rewards */
  borrowApy: Maybe<Array<FloatDataPoint>>;
  /** Amount borrowed on the market, in underlying units. Amount increases as interests accrue. */
  borrowAssets: Maybe<Array<BigIntDataPoint>>;
  /** Amount borrowed on the market, in USD for display purpose */
  borrowAssetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Amount borrowed on the market, in market share units. Amount does not increase as interest accrue. */
  borrowShares: Maybe<Array<BigIntDataPoint>>;
  /** Amount of collateral in the market, in underlying units */
  collateralAssets: Maybe<Array<BigIntDataPoint>>;
  /** Amount of collateral in the market, in USD for display purpose */
  collateralAssetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Daily Borrow APY excluding rewards */
  dailyBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** Daily Borrow APY including rewards */
  dailyNetBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** Daily Supply APY including rewards */
  dailyNetSupplyApy: Maybe<Array<FloatDataPoint>>;
  /** Daily Supply APY excluding rewards */
  dailySupplyApy: Maybe<Array<FloatDataPoint>>;
  /** Fee rate */
  fee: Maybe<Array<FloatDataPoint>>;
  /** Amount available to borrow on the market, in underlying units */
  liquidityAssets: Maybe<Array<BigIntDataPoint>>;
  /** Amount available to borrow on the market, in USD for display purpose */
  liquidityAssetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Monthly Borrow APY excluding rewards */
  monthlyBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** Monthly Borrow APY including rewards */
  monthlyNetBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** Monthly Supply APY including rewards */
  monthlyNetSupplyApy: Maybe<Array<FloatDataPoint>>;
  /** Monthly Supply APY excluding rewards */
  monthlySupplyApy: Maybe<Array<FloatDataPoint>>;
  /** Supply APY including rewards */
  netBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** Supply APY including rewards */
  netSupplyApy: Maybe<Array<FloatDataPoint>>;
  /** Collateral price */
  price: Maybe<Array<FloatDataPoint>>;
  /** Quarterly Borrow APY excluding rewards */
  quarterlyBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** Quarterly Borrow APY including rewards */
  quarterlyNetBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** Quarterly Supply APY including rewards */
  quarterlyNetSupplyApy: Maybe<Array<FloatDataPoint>>;
  /** Quarterly Supply APY excluding rewards */
  quarterlySupplyApy: Maybe<Array<FloatDataPoint>>;
  /** AdaptiveCurveIRM rate per second if utilization was at target */
  rateAtTarget: Maybe<Array<BigIntDataPoint>>;
  /**
   * AdaptiveCurveIRM APY if utilization was at target
   * @deprecated Use `apyAtTarget` instead
   */
  rateAtUTarget: Maybe<Array<FloatDataPoint>>;
  /** Supply APY excluding rewards */
  supplyApy: Maybe<Array<FloatDataPoint>>;
  /** Amount supplied on the market, in underlying units. Amount increases as interests accrue. */
  supplyAssets: Maybe<Array<BigIntDataPoint>>;
  /** Amount supplied on the market, in USD for display purpose */
  supplyAssetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Amount supplied on the market, in market share units. Amount does not increase as interest accrue. */
  supplyShares: Maybe<Array<BigIntDataPoint>>;
  /** Utilization rate */
  utilization: Maybe<Array<FloatDataPoint>>;
  /** Weekly Borrow APY excluding rewards */
  weeklyBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** Weekly Borrow APY including rewards */
  weeklyNetBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** Weekly Supply APY including rewards */
  weeklyNetSupplyApy: Maybe<Array<FloatDataPoint>>;
  /** Weekly Supply APY excluding rewards */
  weeklySupplyApy: Maybe<Array<FloatDataPoint>>;
  /** Yearly Borrow APY excluding rewards */
  yearlyBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** Yearly Borrow APY including rewards */
  yearlyNetBorrowApy: Maybe<Array<FloatDataPoint>>;
  /** Yearly Supply APY including rewards */
  yearlyNetSupplyApy: Maybe<Array<FloatDataPoint>>;
  /** Yearly Supply APY excluding rewards */
  yearlySupplyApy: Maybe<Array<FloatDataPoint>>;
};

/** Market state history */
export type MarketHistoryAllTimeBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryAllTimeNetBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryAllTimeNetSupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryAllTimeSupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryApyAtTargetArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryBorrowAssetsArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryBorrowAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryBorrowSharesArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryCollateralAssetsArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryCollateralAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryDailyBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryDailyNetBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryDailyNetSupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryDailySupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryFeeArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryLiquidityAssetsArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryLiquidityAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryMonthlyBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryMonthlyNetBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryMonthlyNetSupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryMonthlySupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryNetBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryNetSupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryPriceArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryQuarterlyBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryQuarterlyNetBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryQuarterlyNetSupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryQuarterlySupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryRateAtTargetArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryRateAtUTargetArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistorySupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistorySupplyAssetsArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistorySupplyAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistorySupplySharesArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryUtilizationArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryWeeklyBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryWeeklyNetBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryWeeklyNetSupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryWeeklySupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryYearlyBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryYearlyNetBorrowApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryYearlyNetSupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market state history */
export type MarketHistoryYearlySupplyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market liquidation transaction data */
export type MarketLiquidationTransactionData = {
  __typename?: "MarketLiquidationTransactionData";
  badDebtAssets: Scalars["BigInt"]["output"];
  badDebtAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  badDebtShares: Scalars["BigInt"]["output"];
  liquidator: Scalars["Address"]["output"];
  market: Market;
  repaidAssets: Scalars["BigInt"]["output"];
  repaidAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  repaidShares: Scalars["BigInt"]["output"];
  seizedAssets: Scalars["BigInt"]["output"];
  seizedAssetsUsd: Maybe<Scalars["Float"]["output"]>;
};

/** Market oracle accuracy versus spot price */
export type MarketOracleAccuracy = {
  __typename?: "MarketOracleAccuracy";
  /**
   * Average oracle/spot prices deviation
   * @deprecated Not maintained anymore.
   */
  averagePercentDifference: Maybe<Scalars["Float"]["output"]>;
  market: Market;
  /**
   * Maximum oracle/spot prices deviation
   * @deprecated Not maintained anymore.
   */
  maxPercentDifference: Maybe<Scalars["Float"]["output"]>;
};

/** Market oracle feeds */
export type MarketOracleFeed = {
  __typename?: "MarketOracleFeed";
  baseFeedOneAddress: Scalars["Address"]["output"];
  baseFeedOneDescription: Maybe<Scalars["String"]["output"]>;
  baseFeedOneVendor: Maybe<Scalars["String"]["output"]>;
  baseFeedTwoAddress: Scalars["Address"]["output"];
  baseFeedTwoDescription: Maybe<Scalars["String"]["output"]>;
  baseFeedTwoVendor: Maybe<Scalars["String"]["output"]>;
  baseVault: Maybe<Scalars["Address"]["output"]>;
  baseVaultConversionSample: Maybe<Scalars["BigInt"]["output"]>;
  baseVaultDescription: Maybe<Scalars["String"]["output"]>;
  baseVaultVendor: Maybe<Scalars["String"]["output"]>;
  quoteFeedOneAddress: Scalars["Address"]["output"];
  quoteFeedOneDescription: Maybe<Scalars["String"]["output"]>;
  quoteFeedOneVendor: Maybe<Scalars["String"]["output"]>;
  quoteFeedTwoAddress: Scalars["Address"]["output"];
  quoteFeedTwoDescription: Maybe<Scalars["String"]["output"]>;
  quoteFeedTwoVendor: Maybe<Scalars["String"]["output"]>;
  quoteVault: Maybe<Scalars["Address"]["output"]>;
  quoteVaultConversionSample: Maybe<Scalars["BigInt"]["output"]>;
  quoteVaultDescription: Maybe<Scalars["String"]["output"]>;
  quoteVaultVendor: Maybe<Scalars["String"]["output"]>;
  scaleFactor: Maybe<Scalars["BigInt"]["output"]>;
};

/** Market oracle information */
export type MarketOracleInfo = {
  __typename?: "MarketOracleInfo";
  type: OracleType;
};

export enum MarketOrderBy {
  ApyAtTarget = "ApyAtTarget",
  BorrowApy = "BorrowApy",
  BorrowAssets = "BorrowAssets",
  BorrowAssetsUsd = "BorrowAssetsUsd",
  BorrowShares = "BorrowShares",
  CollateralAssetSymbol = "CollateralAssetSymbol",
  CredoraRiskScore = "CredoraRiskScore",
  DailyBorrowApy = "DailyBorrowApy",
  DailyNetBorrowApy = "DailyNetBorrowApy",
  Fee = "Fee",
  Lltv = "Lltv",
  LoanAssetSymbol = "LoanAssetSymbol",
  NetBorrowApy = "NetBorrowApy",
  NetSupplyApy = "NetSupplyApy",
  RateAtUTarget = "RateAtUTarget",
  SupplyApy = "SupplyApy",
  SupplyAssets = "SupplyAssets",
  SupplyAssetsUsd = "SupplyAssetsUsd",
  SupplyShares = "SupplyShares",
  TotalLiquidityUsd = "TotalLiquidityUsd",
  UniqueKey = "UniqueKey",
  Utilization = "Utilization",
}

/** Market position */
export type MarketPosition = {
  __typename?: "MarketPosition";
  /**
   * Amount of loan asset borrowed, in underlying token units.
   * @deprecated Use `state.borrowAssets` instead.
   */
  borrowAssets: Scalars["BigInt"]["output"];
  /**
   * Amount of loan asset borrowed, in USD for display purpose.
   * @deprecated Use `state.borrowAssetsUsd` instead.
   */
  borrowAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /**
   * Amount of loan asset borrowed, in market shares.
   * @deprecated Use `state.borrowShares` instead.
   */
  borrowShares: Scalars["BigInt"]["output"];
  /**
   * Amount of collateral asset deposited on the market, in underlying token units.
   * @deprecated Use `state.collateral` instead.
   */
  collateral: Scalars["BigInt"]["output"];
  /**
   * Amount of collateral asset deposited on the market, in USD for display purpose.
   * @deprecated Use `state.collateralUsd` instead.
   */
  collateralUsd: Maybe<Scalars["Float"]["output"]>;
  /** Health factor of the position, computed as collateral value divided by borrow value. */
  healthFactor: Maybe<Scalars["Float"]["output"]>;
  /** State history */
  historicalState: Maybe<MarketPositionHistory>;
  id: Scalars["ID"]["output"];
  market: Market;
  /** Price variation required for the given position to reach its liquidation threshold (scaled by WAD) */
  priceVariationToLiquidationPrice: Maybe<Scalars["Float"]["output"]>;
  /** Current state */
  state: Maybe<MarketPositionState>;
  /**
   * Amount of loan asset supplied, in underlying token units.
   * @deprecated Use `state.supplyAssets` instead.
   */
  supplyAssets: Scalars["BigInt"]["output"];
  /**
   * Amount of loan asset supplied, in USD for display purpose.
   * @deprecated Use `state.supplyAssetsUsd` instead.
   */
  supplyAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /**
   * Amount of loan asset supplied, in market shares.
   * @deprecated Use `state.supplyShares` instead.
   */
  supplyShares: Scalars["BigInt"]["output"];
  user: User;
};

/** Filtering options for market positions. AND operator is used for multiple filters, while OR operator is used for multiple values in the same filter. */
export type MarketPositionFilters = {
  /** Filter by greater than or equal to given borrow shares */
  borrowShares_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given borrow shares */
  borrowShares_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  /** Filter by greater than or equal to given collateral amount, in underlying token units. */
  collateral_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given collateral amount, in underlying token units. */
  collateral_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by greater than or equal to given health factor */
  healthFactor_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given health factor */
  healthFactor_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by market id */
  marketId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by market unique key */
  marketUniqueKey_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Filter by greater than or equal to given supply shares */
  supplyShares_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given supply shares */
  supplyShares_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by user address. Case insensitive. */
  userAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by user id */
  userId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

/** Market position state history */
export type MarketPositionHistory = {
  __typename?: "MarketPositionHistory";
  /** Borrow assets history. */
  borrowAssets: Maybe<Array<BigIntDataPoint>>;
  /** Borrow assets history, in USD. */
  borrowAssetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the borrow side of the position since its inception, in loan assets. */
  borrowPnl: Maybe<Array<BigIntDataPoint>>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the borrow side of the position since its inception, in USD for display purpose. */
  borrowPnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity history of the borrow side of the position. */
  borrowRoe: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity history of the borrow side of the position, taking into account the loan asset's price variation. */
  borrowRoeUsd: Maybe<Array<FloatDataPoint>>;
  /** Borrow shares history. */
  borrowShares: Maybe<Array<BigIntDataPoint>>;
  /** Collateral history. */
  collateral: Maybe<Array<BigIntDataPoint>>;
  /** Profit & Loss (from the collateral asset's price variation) of the collateral of the position since its inception, in USD for display purpose. */
  collateralPnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity history of the collateral of the position, taking into account the collateral asset's price variation. */
  collateralRoeUsd: Maybe<Array<FloatDataPoint>>;
  /** Collateral value history, in USD. */
  collateralUsd: Maybe<Array<FloatDataPoint>>;
  /** Collateral value history, in loan assets. */
  collateralValue: Maybe<Array<BigIntDataPoint>>;
  /** Margin history, in loan assets. */
  margin: Maybe<Array<BigIntDataPoint>>;
  /** Profit & Loss (from the assets' price variation and loan interest) of the margin of the position since its inception, in loan assets. */
  marginPnl: Maybe<Array<BigIntDataPoint>>;
  /** Profit & Loss (from the collateral asset's price variation and loan interest) of the margin of the position since its inception, in USD for display purpose. */
  marginPnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity history of the margin of the position. */
  marginRoe: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity history of the margin of the position, taking into account prices variation. */
  marginRoeUsd: Maybe<Array<FloatDataPoint>>;
  /** Margin history, in USD. */
  marginUsd: Maybe<Array<FloatDataPoint>>;
  /** Profit (from the collateral asset's price variation) & Loss (from the loan interest) history, in loan assets. */
  pnl: Maybe<Array<BigIntDataPoint>>;
  /** Profit (from the collateral asset's price variation) & Loss (from the loan interest) history, in USD for display purposes. */
  pnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity history. */
  roe: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity history, taking into account prices variation. */
  roeUsd: Maybe<Array<FloatDataPoint>>;
  /** Supply assets history. */
  supplyAssets: Maybe<Array<BigIntDataPoint>>;
  /** Supply assets history, in USD. */
  supplyAssetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the supply side of the position since its inception, in loan assets. */
  supplyPnl: Maybe<Array<BigIntDataPoint>>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the supply side of the position since its inception, in USD for display purpose. */
  supplyPnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity history of the supply side of the position. */
  supplyRoe: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity history of the supply side of the position, taking into account the loan asset's price variation. */
  supplyRoeUsd: Maybe<Array<FloatDataPoint>>;
  /** Supply shares history. */
  supplyShares: Maybe<Array<BigIntDataPoint>>;
};

/** Market position state history */
export type MarketPositionHistoryBorrowAssetsArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryBorrowAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryBorrowPnlArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryBorrowPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryBorrowRoeArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryBorrowRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryBorrowSharesArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryCollateralArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryCollateralPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryCollateralRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryCollateralUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryCollateralValueArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryMarginArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryMarginPnlArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryMarginPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryMarginRoeArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryMarginRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryMarginUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryPnlArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryRoeArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistoryRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistorySupplyAssetsArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistorySupplyAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistorySupplyPnlArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistorySupplyPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistorySupplyRoeArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistorySupplyRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Market position state history */
export type MarketPositionHistorySupplySharesArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

export enum MarketPositionOrderBy {
  BorrowShares = "BorrowShares",
  Collateral = "Collateral",
  HealthFactor = "HealthFactor",
  SupplyShares = "SupplyShares",
}

/** Market position state */
export type MarketPositionState = {
  __typename?: "MarketPositionState";
  /** The latest borrow assets indexed for this position. */
  borrowAssets: Maybe<Scalars["BigInt"]["output"]>;
  /** The latest borrow assets indexed for this position, in USD. */
  borrowAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the borrow side of the position since its inception, in loan assets. */
  borrowPnl: Maybe<Scalars["BigInt"]["output"]>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the borrow side of the position since its inception, in USD for display purpose. */
  borrowPnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the borrow side of the position since its inception. */
  borrowRoe: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the borrow side of the position since its inception, taking into account the loan asset's price variation. */
  borrowRoeUsd: Maybe<Scalars["Float"]["output"]>;
  /** The latest borrow shares indexed for this position. */
  borrowShares: Scalars["BigInt"]["output"];
  /** The latest collateral assets indexed for this position. */
  collateral: Scalars["BigInt"]["output"];
  /** Profit & Loss (from the collateral asset's price variation) of the collateral of the position since its inception, in USD for display purpose. */
  collateralPnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the collateral of the position since its inception, taking into account the collateral asset's price variation. */
  collateralRoeUsd: Maybe<Scalars["Float"]["output"]>;
  /** The latest collateral assets indexed for this position, in USD. */
  collateralUsd: Maybe<Scalars["Float"]["output"]>;
  /** The latest collateral assets indexed for this position, in loan assets. */
  collateralValue: Maybe<Scalars["BigInt"]["output"]>;
  id: Scalars["ID"]["output"];
  /** The latest margin indexed for this position, in loan assets. */
  margin: Maybe<Scalars["BigInt"]["output"]>;
  /** Profit & Loss (from the assets' price variation and loan interest) of the margin of the position since its inception, in loan assets. */
  marginPnl: Maybe<Scalars["BigInt"]["output"]>;
  /** Profit & Loss (from the collateral asset's price variation and loan interest) of the margin of the position since its inception, in USD for display purpose. */
  marginPnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the margin of the position since its inception. */
  marginRoe: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the margin of the position since its inception, taking into account prices variation. */
  marginRoeUsd: Maybe<Scalars["Float"]["output"]>;
  /** The latest margin indexed for this position, in USD. */
  marginUsd: Maybe<Scalars["Float"]["output"]>;
  /** Profit (from the collateral asset's price variation) & Loss (from the loan interest) of the position since its inception, in loan assets. */
  pnl: Maybe<Scalars["BigInt"]["output"]>;
  /** Profit (from the collateral asset's price variation) & Loss (from the loan interest) of the position since its inception, in USD for display purpose. */
  pnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the position since its inception. */
  roe: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the position since its inception, taking into account prices variation. */
  roeUsd: Maybe<Scalars["Float"]["output"]>;
  /** The latest supply assets indexed for this position. */
  supplyAssets: Maybe<Scalars["BigInt"]["output"]>;
  /** The latest supply assets indexed for this position, in USD. */
  supplyAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the supply side of the position since its inception, in loan assets. */
  supplyPnl: Maybe<Scalars["BigInt"]["output"]>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the supply side of the position since its inception, in USD for display purpose. */
  supplyPnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the supply side of the position since its inception. */
  supplyRoe: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the supply side of the position since its inception, taking into account the loan asset's price variation. */
  supplyRoeUsd: Maybe<Scalars["Float"]["output"]>;
  /** The latest supply shares indexed for this position. */
  supplyShares: Scalars["BigInt"]["output"];
  /** The latest update timestamp. */
  timestamp: Scalars["BigInt"]["output"];
};

/** Morpho Blue market state */
export type MarketState = {
  __typename?: "MarketState";
  /** All Time Borrow APY excluding rewards */
  allTimeBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** All Time Borrow APY including rewards */
  allTimeNetBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** All Time Supply APY including rewards */
  allTimeNetSupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** All Time Supply APY excluding rewards */
  allTimeSupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Apy at target utilization */
  apyAtTarget: Scalars["Float"]["output"];
  /** Borrow APY */
  borrowApy: Scalars["Float"]["output"];
  /** Amount borrowed on the market, in underlying units. Amount increases as interests accrue. */
  borrowAssets: Scalars["BigInt"]["output"];
  /** Amount borrowed on the market, in USD for display purpose */
  borrowAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** Amount borrowed on the market, in market share units. Amount does not increase as interest accrue. */
  borrowShares: Scalars["BigInt"]["output"];
  /** Amount of collateral in the market, in underlying units */
  collateralAssets: Maybe<Scalars["BigInt"]["output"]>;
  /** Amount of collateral in the market, in USD for display purpose */
  collateralAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** Daily Borrow APY excluding rewards */
  dailyBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Daily Borrow APY including rewards */
  dailyNetBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Daily Supply APY including rewards */
  dailyNetSupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Variation of the collateral price over the last 24 hours */
  dailyPriceVariation: Maybe<Scalars["Float"]["output"]>;
  /** Daily Supply APY excluding rewards */
  dailySupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Fee rate */
  fee: Scalars["Float"]["output"];
  id: Scalars["ID"]["output"];
  /** Amount available to borrow on the market, in underlying units */
  liquidityAssets: Scalars["BigInt"]["output"];
  /** Amount available to borrow on the market, in USD for display purpose */
  liquidityAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** Monthly Borrow APY excluding rewards */
  monthlyBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Monthly Borrow APY including rewards */
  monthlyNetBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Monthly Supply APY including rewards */
  monthlyNetSupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Monthly Supply APY excluding rewards */
  monthlySupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Borrow APY including rewards */
  netBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Supply APY including rewards */
  netSupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Collateral price */
  price: Maybe<Scalars["BigInt"]["output"]>;
  /** Quarterly Borrow APY excluding rewards */
  quarterlyBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Quarterly Borrow APY including rewards */
  quarterlyNetBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Quarterly Supply APY including rewards */
  quarterlyNetSupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Quarterly Supply APY excluding rewards */
  quarterlySupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Rate at target utilization */
  rateAtTarget: Maybe<Scalars["BigInt"]["output"]>;
  /**
   * Apy at target utilization
   * @deprecated Use `apyAtTarget` instead
   */
  rateAtUTarget: Scalars["Float"]["output"];
  /** Market state rewards */
  rewards: Maybe<Array<MarketStateReward>>;
  /** Supply APY */
  supplyApy: Scalars["Float"]["output"];
  /** Amount supplied on the market, in underlying units. Amount increases as interests accrue. */
  supplyAssets: Scalars["BigInt"]["output"];
  /** Amount supplied on the market, in USD for display purpose */
  supplyAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** Amount supplied on the market, in market share units. Amount does not increase as interest accrue. */
  supplyShares: Scalars["BigInt"]["output"];
  /** Last update timestamp. */
  timestamp: Scalars["BigInt"]["output"];
  /** Utilization rate */
  utilization: Scalars["Float"]["output"];
  /** Weekly Borrow APY excluding rewards */
  weeklyBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Weekly Borrow APY including rewards */
  weeklyNetBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Weekly Supply APY including rewards */
  weeklyNetSupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Weekly Supply APY excluding rewards */
  weeklySupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Yearly Borrow APY excluding rewards */
  yearlyBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Yearly Borrow APY including rewards */
  yearlyNetBorrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Yearly Supply APY including rewards */
  yearlyNetSupplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Yearly Supply APY excluding rewards */
  yearlySupplyApy: Maybe<Scalars["Float"]["output"]>;
};

/** Morpho Blue market state rewards */
export type MarketStateReward = {
  __typename?: "MarketStateReward";
  /** Amount of reward tokens per borrowed token (annualized). Scaled to reward asset decimals. */
  amountPerBorrowedToken: Scalars["BigInt"]["output"];
  /** Amount of reward tokens per supplied token (annualized). Scaled to reward asset decimals. */
  amountPerSuppliedToken: Scalars["BigInt"]["output"];
  asset: Asset;
  /** Borrow rewards APR. */
  borrowApr: Maybe<Scalars["Float"]["output"]>;
  /**
   * Borrow rewards APY.
   * @deprecated Use `borrowApr` instead. This field will be removed in the future.
   */
  borrowApy: Maybe<Scalars["Float"]["output"]>;
  /** Supply rewards APR. */
  supplyApr: Maybe<Scalars["Float"]["output"]>;
  /**
   * Supply rewards APY.
   * @deprecated Use `supplyApr` instead. This field will be removed in the future.
   */
  supplyApy: Maybe<Scalars["Float"]["output"]>;
  /** Amount of reward tokens per year on the borrow side. Scaled to reward asset decimals. */
  yearlyBorrowTokens: Scalars["BigInt"]["output"];
  /** Amount of reward tokens per year on the supply side. Scaled to reward asset decimals. */
  yearlySupplyTokens: Scalars["BigInt"]["output"];
};

/** Market transfer transaction data */
export type MarketTransferTransactionData = {
  __typename?: "MarketTransferTransactionData";
  assets: Scalars["BigInt"]["output"];
  assetsUsd: Maybe<Scalars["Float"]["output"]>;
  market: Market;
  shares: Scalars["BigInt"]["output"];
};

/** Market warning */
export type MarketWarning = {
  __typename?: "MarketWarning";
  level: WarningLevel;
  metadata: Maybe<MarketWarningMetadata>;
  type: Scalars["String"]["output"];
};

export type MarketWarningMetadata = CustomMetadata | HardcodedPriceMetadata;

export type Metadata = SafeAddressMetadata;

/** Morpho Blue deployment */
export type MorphoBlue = {
  __typename?: "MorphoBlue";
  address: Scalars["Address"]["output"];
  chain: Chain;
  creationBlockNumber: Scalars["Int"]["output"];
  /** State history */
  historicalState: Maybe<MorphoBlueStateHistory>;
  id: Scalars["ID"]["output"];
  /** Current state */
  state: Maybe<MorphoBlueState>;
};

/** Filtering options for morpho blue deployments. */
export type MorphoBlueFilters = {
  /** Filter by deployment address. Case insensitive. */
  address_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  /** Filter by morpho blue id */
  id_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export enum MorphoBlueOrderBy {
  Address = "Address",
}

/** Morpho Blue global state */
export type MorphoBlueState = {
  __typename?: "MorphoBlueState";
  id: Scalars["ID"]["output"];
  /** Number of markets in the protocol */
  marketCount: Scalars["Int"]["output"];
  /** Last update timestamp. */
  timestamp: Scalars["BigInt"]["output"];
  /** Amount borrowed in all markets, in USD for display purpose */
  totalBorrowUsd: Scalars["Float"]["output"];
  /** Amount of collateral in all markets, in USD for display purpose */
  totalCollateralUsd: Scalars["Float"]["output"];
  /** Amount deposited in all markets, in USD for display purpose */
  totalDepositUsd: Scalars["Float"]["output"];
  /** Amount supplied in all markets, in USD for display purpose */
  totalSupplyUsd: Scalars["Float"]["output"];
  /** TVL (collateral + supply - borrows), in USD for display purpose */
  tvlUsd: Scalars["Float"]["output"];
  /** Number of unique users that have interacted with the protocol */
  userCount: Scalars["Int"]["output"];
  /** Number of meta morpho vaults in the protocol */
  vaultCount: Scalars["Int"]["output"];
};

/** Morpho Blue state history */
export type MorphoBlueStateHistory = {
  __typename?: "MorphoBlueStateHistory";
  /** Number of markets in the protocol */
  marketCount: Maybe<Array<IntDataPoint>>;
  /** Amount borrowed in all markets, in USD for display purpose */
  totalBorrowUsd: Maybe<Array<FloatDataPoint>>;
  /** Amount of collateral in all markets, in USD for display purpose. */
  totalCollateralUsd: Maybe<Array<FloatDataPoint>>;
  /** Amount deposited in all markets, in USD for display purpose */
  totalDepositUsd: Maybe<Array<FloatDataPoint>>;
  /** Amount supplied in all markets, in USD for display purpose */
  totalSupplyUsd: Maybe<Array<FloatDataPoint>>;
  /** TVL (collateral + supply - borrows), in USD for display purpose */
  tvlUsd: Maybe<Array<FloatDataPoint>>;
  /** Number of unique users that have interacted with the protocol */
  userCount: Maybe<Array<IntDataPoint>>;
  /** Number of meta morpho vaults in the protocol */
  vaultCount: Maybe<Array<IntDataPoint>>;
};

/** Morpho Blue state history */
export type MorphoBlueStateHistoryMarketCountArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Morpho Blue state history */
export type MorphoBlueStateHistoryTotalBorrowUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Morpho Blue state history */
export type MorphoBlueStateHistoryTotalCollateralUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Morpho Blue state history */
export type MorphoBlueStateHistoryTotalDepositUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Morpho Blue state history */
export type MorphoBlueStateHistoryTotalSupplyUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Morpho Blue state history */
export type MorphoBlueStateHistoryTvlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Morpho Blue state history */
export type MorphoBlueStateHistoryUserCountArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Morpho Blue state history */
export type MorphoBlueStateHistoryVaultCountArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Morpho chainlink oracle data */
export type MorphoChainlinkOracleData = {
  __typename?: "MorphoChainlinkOracleData";
  baseFeedOne: Maybe<OracleFeed>;
  baseFeedTwo: Maybe<OracleFeed>;
  baseOracleVault: Maybe<OracleVault>;
  chainId: Scalars["Int"]["output"];
  quoteFeedOne: Maybe<OracleFeed>;
  quoteFeedTwo: Maybe<OracleFeed>;
  scaleFactor: Scalars["BigInt"]["output"];
  /** @deprecated Use `baseOracleVault` instead */
  vault: Scalars["String"]["output"];
  vaultConversionSample: Scalars["BigInt"]["output"];
};

/** Morpho chainlink oracle v2 data */
export type MorphoChainlinkOracleV2Data = {
  __typename?: "MorphoChainlinkOracleV2Data";
  baseFeedOne: Maybe<OracleFeed>;
  baseFeedTwo: Maybe<OracleFeed>;
  baseOracleVault: Maybe<OracleVault>;
  /** @deprecated Use `baseOracleVault` instead */
  baseVault: Scalars["String"]["output"];
  baseVaultConversionSample: Scalars["BigInt"]["output"];
  chainId: Scalars["Int"]["output"];
  quoteFeedOne: Maybe<OracleFeed>;
  quoteFeedTwo: Maybe<OracleFeed>;
  quoteOracleVault: Maybe<OracleVault>;
  /** @deprecated Use `quoteOracleVault` instead */
  quoteVault: Scalars["String"]["output"];
  quoteVaultConversionSample: Scalars["BigInt"]["output"];
  scaleFactor: Scalars["BigInt"]["output"];
};

/** Oracle */
export type Oracle = {
  __typename?: "Oracle";
  /** Oracle contract address */
  address: Scalars["Address"]["output"];
  chain: Chain;
  creationEvent: Maybe<ChainlinkOracleV2Event>;
  data: Maybe<OracleData>;
  id: Scalars["ID"]["output"];
  markets: Array<Market>;
  /** Oracle type */
  type: OracleType;
};

export type OracleData =
  | MorphoChainlinkOracleData
  | MorphoChainlinkOracleV2Data;

/** Oracle Feed */
export type OracleFeed = {
  __typename?: "OracleFeed";
  /** Feed contract address */
  address: Scalars["Address"]["output"];
  chain: Chain;
  decimals: Maybe<Scalars["Int"]["output"]>;
  description: Maybe<Scalars["String"]["output"]>;
  historicalPrice: Maybe<Array<BigIntDataPoint>>;
  id: Scalars["ID"]["output"];
  pair: Maybe<Array<Scalars["String"]["output"]>>;
  price: Maybe<BigIntDataPoint>;
  vendor: Maybe<Scalars["String"]["output"]>;
};

/** Oracle Feed */
export type OracleFeedHistoricalPriceArgs = {
  options: TimeseriesOptions;
};

export type OracleFeedsFilters = {
  /** Filter by feed contract address. Case insensitive. */
  address_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
};

export enum OracleType {
  ChainlinkOracle = "ChainlinkOracle",
  ChainlinkOracleV2 = "ChainlinkOracleV2",
  CustomOracle = "CustomOracle",
  Unknown = "Unknown",
}

/** Oracle Vault */
export type OracleVault = {
  __typename?: "OracleVault";
  /** Vault contract address */
  address: Scalars["Address"]["output"];
  assetId: Maybe<Scalars["String"]["output"]>;
  chain: Chain;
  decimals: Maybe<Scalars["Int"]["output"]>;
  historicalPrice: Maybe<Array<BigIntDataPoint>>;
  id: Scalars["ID"]["output"];
  metamorphoId: Maybe<Scalars["String"]["output"]>;
  pair: Maybe<Array<Scalars["String"]["output"]>>;
  price: Maybe<BigIntDataPoint>;
  vendor: Maybe<Scalars["String"]["output"]>;
};

/** Oracle Vault */
export type OracleVaultHistoricalPriceArgs = {
  options: TimeseriesOptions;
};

export type OracleVaultsFilters = {
  /** Filter by vault contract address. Case insensitive. */
  address_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
};

export type OraclesFilters = {
  /** Filter by oracle contract address. Case insensitive. */
  address_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
};

export enum OrderDirection {
  Asc = "Asc",
  Desc = "Desc",
}

/** Event data for ownership-related operations */
export type OwnershipEventData = {
  __typename?: "OwnershipEventData";
  owner: Scalars["Address"]["output"];
};

export type PageInfo = {
  __typename?: "PageInfo";
  /** Number of items as scoped by pagination. */
  count: Scalars["Int"]["output"];
  /** Total number of items */
  countTotal: Scalars["Int"]["output"];
  /** Number of items requested. */
  limit: Scalars["Int"]["output"];
  /** Number of items skipped. */
  skip: Scalars["Int"]["output"];
};

export type PaginatedAddressMetadata = {
  __typename?: "PaginatedAddressMetadata";
  items: Maybe<Array<AddressMetadata>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedAssets = {
  __typename?: "PaginatedAssets";
  items: Maybe<Array<Asset>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedCurators = {
  __typename?: "PaginatedCurators";
  items: Maybe<Array<Curator>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedMarketPositions = {
  __typename?: "PaginatedMarketPositions";
  items: Maybe<Array<MarketPosition>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedMarkets = {
  __typename?: "PaginatedMarkets";
  items: Maybe<Array<Market>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedMetaMorphoFactories = {
  __typename?: "PaginatedMetaMorphoFactories";
  items: Maybe<Array<VaultFactory>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedMetaMorphoPositions = {
  __typename?: "PaginatedMetaMorphoPositions";
  items: Maybe<Array<VaultPosition>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedMetaMorphos = {
  __typename?: "PaginatedMetaMorphos";
  items: Maybe<Array<Vault>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedMorphoBlue = {
  __typename?: "PaginatedMorphoBlue";
  items: Maybe<Array<MorphoBlue>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedOracleFeeds = {
  __typename?: "PaginatedOracleFeeds";
  items: Maybe<Array<OracleFeed>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedOracleVaults = {
  __typename?: "PaginatedOracleVaults";
  items: Maybe<Array<OracleVault>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedOracles = {
  __typename?: "PaginatedOracles";
  items: Maybe<Array<Oracle>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedPublicAllocator = {
  __typename?: "PaginatedPublicAllocator";
  items: Maybe<Array<PublicAllocator>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedPublicAllocatorReallocates = {
  __typename?: "PaginatedPublicAllocatorReallocates";
  items: Maybe<Array<PublicAllocatorReallocate>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedTransactions = {
  __typename?: "PaginatedTransactions";
  items: Maybe<Array<Transaction>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedUsers = {
  __typename?: "PaginatedUsers";
  items: Maybe<Array<User>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedVaultAdminEvent = {
  __typename?: "PaginatedVaultAdminEvent";
  items: Maybe<Array<VaultAdminEvent>>;
  pageInfo: Maybe<PageInfo>;
};

export type PaginatedVaultReallocates = {
  __typename?: "PaginatedVaultReallocates";
  items: Maybe<Array<VaultReallocate>>;
  pageInfo: Maybe<PageInfo>;
};

/** Public allocator */
export type PublicAllocator = {
  __typename?: "PublicAllocator";
  address: Scalars["Address"]["output"];
  creationBlockNumber: Scalars["Int"]["output"];
  id: Scalars["ID"]["output"];
  morphoBlue: MorphoBlue;
};

/** Public allocator configuration */
export type PublicAllocatorConfig = {
  __typename?: "PublicAllocatorConfig";
  accruedFee: Scalars["BigInt"]["output"];
  admin: Scalars["Address"]["output"];
  fee: Scalars["BigInt"]["output"];
  flowCaps: Array<PublicAllocatorFlowCaps>;
};

/** Filtering options for public allocators. */
export type PublicAllocatorFilters = {
  /** Filter by address. Case insensitive. */
  address_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  /** Filter by ids */
  id_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

/** Public allocator flow caps */
export type PublicAllocatorFlowCaps = {
  __typename?: "PublicAllocatorFlowCaps";
  market: Market;
  /** Public allocator flow cap in USD */
  maxIn: Scalars["BigInt"]["output"];
  /** Public allocator flow cap in underlying */
  maxOut: Scalars["BigInt"]["output"];
};

export enum PublicAllocatorOrderBy {
  Address = "Address",
}

/** Public alllocator reallocate */
export type PublicAllocatorReallocate = {
  __typename?: "PublicAllocatorReallocate";
  assets: Scalars["BigInt"]["output"];
  blockNumber: Scalars["BigInt"]["output"];
  hash: Scalars["HexString"]["output"];
  id: Scalars["ID"]["output"];
  logIndex: Scalars["Int"]["output"];
  market: Market;
  publicAllocator: PublicAllocator;
  sender: Scalars["Address"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  type: PublicAllocatorReallocateType;
  vault: Vault;
};

export enum PublicAllocatorReallocateOrderBy {
  Assets = "Assets",
  Timestamp = "Timestamp",
}

export enum PublicAllocatorReallocateType {
  Deposit = "Deposit",
  Withdraw = "Withdraw",
}

/** Public alllocator shared liquidity */
export type PublicAllocatorSharedLiquidity = {
  __typename?: "PublicAllocatorSharedLiquidity";
  allocationMarket: Market;
  assets: Scalars["BigInt"]["output"];
  id: Scalars["ID"]["output"];
  market: Market;
  publicAllocator: PublicAllocator;
  vault: Vault;
};

/** Filtering options for public allocator reallocates. AND operator is used for multiple filters, while OR operator is used for multiple values in the same filter. */
export type PublicallocatorReallocateFilters = {
  /** Filter by greater than or equal to given amount of market assets, in underlying token units */
  assets_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of market assets, in underlying token units */
  assets_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  /** Filter by market id */
  marketId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by market unique key */
  marketUniqueKey_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by greater than or equal to given timestamp */
  timestamp_gte?: InputMaybe<Scalars["Int"]["input"]>;
  /** Filter by lower than or equal to given timestamp */
  timestamp_lte?: InputMaybe<Scalars["Int"]["input"]>;
  /** Filter by reallocate type */
  type_in?: InputMaybe<Array<PublicAllocatorReallocateType>>;
  /** Filter by MetaMorpho vault address */
  vaultAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by MetaMorpho vault id */
  vaultId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type Query = {
  __typename?: "Query";
  asset: Asset;
  assetByAddress: Asset;
  assets: PaginatedAssets;
  chain: Chain;
  chainSynchronizationState: ChainSynchronizationState;
  chainSynchronizationStates: Array<ChainSynchronizationState>;
  chains: Array<Chain>;
  curators: PaginatedCurators;
  market: Market;
  marketAverageApys: Maybe<MarketApyAggregates>;
  marketByUniqueKey: Market;
  marketCollateralAtRisk: MarketCollateralAtRisk;
  marketOracleAccuracy: MarketOracleAccuracy;
  marketPosition: MarketPosition;
  marketPositions: PaginatedMarketPositions;
  markets: PaginatedMarkets;
  morphoBlue: MorphoBlue;
  morphoBlueByAddress: MorphoBlue;
  morphoBlues: PaginatedMorphoBlue;
  oracleByAddress: Oracle;
  oracleFeedByAddress: OracleFeed;
  oracleFeeds: PaginatedOracleFeeds;
  oracleVaultByAddress: OracleVault;
  oracleVaults: PaginatedOracleVaults;
  oracles: PaginatedOracles;
  publicAllocator: PublicAllocator;
  publicAllocatorReallocates: PaginatedPublicAllocatorReallocates;
  publicAllocators: PaginatedPublicAllocator;
  search: SearchResults;
  transaction: Transaction;
  /** @deprecated Multiple Transaction entities correspond to a single hash, because a Transaction entity corresponds to an onchain event. */
  transactionByHash: Transaction;
  transactions: PaginatedTransactions;
  user: User;
  userByAddress: User;
  users: PaginatedUsers;
  vault: Vault;
  vaultByAddress: Vault;
  vaultFactories: PaginatedMetaMorphoFactories;
  vaultFactory: VaultFactory;
  vaultFactoryByAddress: VaultFactory;
  vaultPosition: VaultPosition;
  vaultPositions: PaginatedMetaMorphoPositions;
  vaultReallocates: PaginatedVaultReallocates;
  vaults: PaginatedMetaMorphos;
};

export type QueryAssetArgs = {
  id: Scalars["String"]["input"];
};

export type QueryAssetByAddressArgs = {
  address: Scalars["String"]["input"];
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryAssetsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<AssetOrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<AssetsFilters>;
};

export type QueryChainArgs = {
  id: Scalars["Int"]["input"];
};

export type QueryChainSynchronizationStateArgs = {
  chainId: Scalars["Int"]["input"];
  key: Scalars["String"]["input"];
};

export type QueryCuratorsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<CuratorFilters>;
};

export type QueryMarketArgs = {
  id: Scalars["String"]["input"];
};

export type QueryMarketAverageApysArgs = {
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
  startTimestamp: Scalars["Float"]["input"];
  uniqueKey: Scalars["String"]["input"];
};

export type QueryMarketByUniqueKeyArgs = {
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
  uniqueKey: Scalars["String"]["input"];
};

export type QueryMarketCollateralAtRiskArgs = {
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
  numberOfPoints?: InputMaybe<Scalars["Float"]["input"]>;
  uniqueKey: Scalars["String"]["input"];
};

export type QueryMarketOracleAccuracyArgs = {
  marketId: Scalars["String"]["input"];
  options?: InputMaybe<TimeseriesOptions>;
};

export type QueryMarketPositionArgs = {
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
  marketUniqueKey: Scalars["String"]["input"];
  userAddress: Scalars["String"]["input"];
};

export type QueryMarketPositionsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<MarketPositionOrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<MarketPositionFilters>;
};

export type QueryMarketsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<MarketOrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<MarketFilters>;
};

export type QueryMorphoBlueArgs = {
  id: Scalars["String"]["input"];
};

export type QueryMorphoBlueByAddressArgs = {
  address: Scalars["String"]["input"];
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryMorphoBluesArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<MorphoBlueOrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<MorphoBlueFilters>;
};

export type QueryOracleByAddressArgs = {
  address: Scalars["String"]["input"];
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryOracleFeedByAddressArgs = {
  address: Scalars["String"]["input"];
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryOracleFeedsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<OracleFeedsFilters>;
};

export type QueryOracleVaultByAddressArgs = {
  address: Scalars["String"]["input"];
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryOracleVaultsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<OracleVaultsFilters>;
};

export type QueryOraclesArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<OraclesFilters>;
};

export type QueryPublicAllocatorArgs = {
  address: Scalars["String"]["input"];
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryPublicAllocatorReallocatesArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PublicAllocatorReallocateOrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PublicallocatorReallocateFilters>;
};

export type QueryPublicAllocatorsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PublicAllocatorOrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PublicAllocatorFilters>;
};

export type QuerySearchArgs = {
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  marketOrderBy?: InputMaybe<MarketOrderBy>;
  numberOfResults?: InputMaybe<Scalars["Int"]["input"]>;
  search: Scalars["String"]["input"];
  vaultOrderBy?: InputMaybe<VaultOrderBy>;
};

export type QueryTransactionArgs = {
  id: Scalars["String"]["input"];
};

export type QueryTransactionByHashArgs = {
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
  hash: Scalars["String"]["input"];
};

export type QueryTransactionsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<TransactionsOrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<TransactionFilters>;
};

export type QueryUserArgs = {
  id: Scalars["String"]["input"];
};

export type QueryUserByAddressArgs = {
  address: Scalars["String"]["input"];
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryUsersArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<UsersOrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<UsersFilters>;
};

export type QueryVaultArgs = {
  id: Scalars["String"]["input"];
};

export type QueryVaultByAddressArgs = {
  address: Scalars["String"]["input"];
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryVaultFactoryArgs = {
  id: Scalars["String"]["input"];
};

export type QueryVaultFactoryByAddressArgs = {
  address: Scalars["String"]["input"];
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryVaultPositionArgs = {
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
  userAddress: Scalars["String"]["input"];
  vaultAddress: Scalars["String"]["input"];
};

export type QueryVaultPositionsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<VaultPositionOrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<VaultPositionFilters>;
};

export type QueryVaultReallocatesArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<VaultReallocateOrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<VaultReallocateFilters>;
};

export type QueryVaultsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<VaultOrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<VaultFilters>;
};

/** ReallocateSupply event data */
export type ReallocateSupplyEventData = {
  __typename?: "ReallocateSupplyEventData";
  market: Market;
  suppliedAssets: Scalars["BigInt"]["output"];
  suppliedShares: Scalars["BigInt"]["output"];
};

/** ReallocateWithdraw event data */
export type ReallocateWithdrawEventData = {
  __typename?: "ReallocateWithdrawEventData";
  market: Market;
  withdrawnAssets: Scalars["BigInt"]["output"];
  withdrawnShares: Scalars["BigInt"]["output"];
};

/** Event data for revokeCap operation */
export type RevokeCapEventData = {
  __typename?: "RevokeCapEventData";
  market: Market;
};

/** Event data for revokePendingMarketRemoval operation */
export type RevokePendingMarketRemovalEventData = {
  __typename?: "RevokePendingMarketRemovalEventData";
  market: Market;
};

/** Risk analysis */
export type RiskAnalysis = {
  __typename?: "RiskAnalysis";
  isUnderReview: Scalars["Boolean"]["output"];
  provider: RiskProvider;
  rating: Maybe<Scalars["String"]["output"]>;
  score: Scalars["Float"]["output"];
  timestamp: Scalars["Float"]["output"];
};

export enum RiskProvider {
  Credora = "CREDORA",
}

/** Safe address metadata */
export type SafeAddressMetadata = {
  __typename?: "SafeAddressMetadata";
  owners: Array<Scalars["String"]["output"]>;
  threshold: Scalars["Int"]["output"];
};

/** Global search results */
export type SearchResults = {
  __typename?: "SearchResults";
  markets: Array<Market>;
  vaults: Array<Vault>;
};

/** SetCurator event data */
export type SetCuratorEventData = {
  __typename?: "SetCuratorEventData";
  curatorAddress: Scalars["Address"]["output"];
};

/** SetFee event data */
export type SetFeeEventData = {
  __typename?: "SetFeeEventData";
  fee: Scalars["BigInt"]["output"];
};

/** SetFeeRecipient event data */
export type SetFeeRecipientEventData = {
  __typename?: "SetFeeRecipientEventData";
  feeRecipient: Scalars["Address"]["output"];
};

/** SetGuardian event data */
export type SetGuardianEventData = {
  __typename?: "SetGuardianEventData";
  guardian: Scalars["Address"]["output"];
};

/** SetIsAllocator event data */
export type SetIsAllocatorEventData = {
  __typename?: "SetIsAllocatorEventData";
  allocator: Scalars["Address"]["output"];
  isAllocator: Scalars["Boolean"]["output"];
};

/** SetSkimRecipient event data */
export type SetSkimRecipientEventData = {
  __typename?: "SetSkimRecipientEventData";
  skimRecipient: Scalars["Address"]["output"];
};

/** SetSupplyQueue event data */
export type SetSupplyQueueEventData = {
  __typename?: "SetSupplyQueueEventData";
  supplyQueue: Array<Market>;
};

/** SetWithdrawQueue event data */
export type SetWithdrawQueueEventData = {
  __typename?: "SetWithdrawQueueEventData";
  withdrawQueue: Array<Market>;
};

/** Skim event data */
export type SkimEventData = {
  __typename?: "SkimEventData";
  amount: Scalars["BigInt"]["output"];
  asset: Asset;
};

/** Event data for timelock-related operation */
export type TimelockEventData = {
  __typename?: "TimelockEventData";
  timelock: Scalars["BigInt"]["output"];
};

export enum TimeseriesInterval {
  /** @deprecated Use startTimestamp and endTimestamp instead. */
  All = "ALL",
  Day = "DAY",
  /** @deprecated HOUR is the minimum interval. */
  FifteenMinutes = "FIFTEEN_MINUTES",
  /** @deprecated HOUR is the minimum interval. */
  FiveMinutes = "FIVE_MINUTES",
  /** @deprecated HOUR is the minimum interval. */
  HalfHour = "HALF_HOUR",
  Hour = "HOUR",
  /** @deprecated HOUR is the minimum interval. */
  Minute = "MINUTE",
  Month = "MONTH",
  Quarter = "QUARTER",
  Week = "WEEK",
  Year = "YEAR",
}

export type TimeseriesOptions = {
  /** Unix timestamp (Inclusive). */
  endTimestamp?: InputMaybe<Scalars["Int"]["input"]>;
  /** The timestamp interval to space and group points. Defaults to around 50 points between startTimestamp and endTimestamp. */
  interval?: InputMaybe<TimeseriesInterval>;
  /** Unix timestamp (Inclusive). */
  startTimestamp?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Transaction */
export type Transaction = {
  __typename?: "Transaction";
  blockNumber: Scalars["BigInt"]["output"];
  chain: Chain;
  data: TransactionData;
  hash: Scalars["HexString"]["output"];
  id: Scalars["ID"]["output"];
  logIndex: Scalars["Int"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  type: TransactionType;
  user: User;
};

export type TransactionData =
  | MarketCollateralTransferTransactionData
  | MarketLiquidationTransactionData
  | MarketTransferTransactionData
  | VaultTransactionData;

/** Filtering options for transactions. AND operator is used for multiple filters, while OR operator is used for multiple values in the same filter. */
export type TransactionFilters = {
  /** Filter by token contract address. Case insensitive. */
  assetAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by asset id */
  assetId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by token symbol. */
  assetSymbol_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by greater than or equal to given amount of market assets, in USD */
  assetsUsd_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given amount of market assets, in USD */
  assetsUsd_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given amount of market assets, in underlying token units */
  assets_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of market assets, in underlying token units */
  assets_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by greater than or equal to given amount of bad debt assets, in USD. Applies exclusively to MarketLiquidation transactions. */
  badDebtAssetsUsd_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given amount of bad debt assets, in USD. Applies exclusively to MarketLiquidation transactions. */
  badDebtAssetsUsd_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given amount of bad debt assets. Applies exclusively to MarketLiquidation transactions. */
  badDebtAssets_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of bad debt assets. Applies exclusively to MarketLiquidation transactions. */
  badDebtAssets_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by greater than or equal to given amount of bad debt shares. Applies exclusively to MarketLiquidation transactions. */
  badDebtShares_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of bad debt shares. Applies exclusively to MarketLiquidation transactions. */
  badDebtShares_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  /** Filter by transaction hash */
  hash?: InputMaybe<Scalars["String"]["input"]>;
  /** Filter by liquidator address. Applies exclusively to MarketLiquidation transactions. */
  liquidator_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by market id */
  marketId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by market unique key */
  marketUniqueKey_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by greater than or equal to given amount of repaid shares, in USD. Applies exclusively to MarketLiquidation transactions. */
  repaidAssetsUsd_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given amount of repaid shares, in USD. Applies exclusively to MarketLiquidation transactions. */
  repaidAssetsUsd_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given amount of repaid shares. Applies exclusively to MarketLiquidation transactions. */
  repaidAssets_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of repaid shares. Applies exclusively to MarketLiquidation transactions. */
  repaidAssets_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by greater than or equal to given amount of repaid shares. Applies exclusively to MarketLiquidation transactions. */
  repaidShares_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of repaid shares. Applies exclusively to MarketLiquidation transactions. */
  repaidShares_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Filter by greater than or equal to given amount of seized shares, in USD. Applies exclusively to MarketLiquidation transactions. */
  seizedAssetsUsd_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given amount of seized shares, in USD. Applies exclusively to MarketLiquidation transactions. */
  seizedAssetsUsd_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given amount of seized shares. Applies exclusively to MarketLiquidation transactions. */
  seizedAssets_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of seized shares. Applies exclusively to MarketLiquidation transactions. */
  seizedAssets_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by greater than or equal to given amount of MetaMorpho vault shares */
  shares_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of MetaMorpho vault shares */
  shares_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by greater than or equal to given timestamp */
  timestamp_gte?: InputMaybe<Scalars["Int"]["input"]>;
  /** Filter by lower than or equal to given timestamp */
  timestamp_lte?: InputMaybe<Scalars["Int"]["input"]>;
  /** Filter by transaction type */
  type_in?: InputMaybe<Array<TransactionType>>;
  /** Filter by user address. Case insensitive. */
  userAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by user id */
  userId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by MetaMorpho vault address */
  vaultAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by MetaMorpho vault id */
  vaultId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export enum TransactionType {
  MarketBorrow = "MarketBorrow",
  MarketLiquidation = "MarketLiquidation",
  MarketRepay = "MarketRepay",
  MarketSupply = "MarketSupply",
  MarketSupplyCollateral = "MarketSupplyCollateral",
  MarketWithdraw = "MarketWithdraw",
  MarketWithdrawCollateral = "MarketWithdrawCollateral",
  MetaMorphoDeposit = "MetaMorphoDeposit",
  MetaMorphoFee = "MetaMorphoFee",
  MetaMorphoTransfer = "MetaMorphoTransfer",
  MetaMorphoWithdraw = "MetaMorphoWithdraw",
}

export enum TransactionsOrderBy {
  Assets = "Assets",
  AssetsUsd = "AssetsUsd",
  BadDebtAssets = "BadDebtAssets",
  BadDebtAssetsUsd = "BadDebtAssetsUsd",
  BadDebtShares = "BadDebtShares",
  RepaidAssets = "RepaidAssets",
  RepaidAssetsUsd = "RepaidAssetsUsd",
  RepaidShares = "RepaidShares",
  SeizedAssets = "SeizedAssets",
  SeizedAssetsUsd = "SeizedAssetsUsd",
  Shares = "Shares",
  Timestamp = "Timestamp",
}

/** User */
export type User = {
  __typename?: "User";
  address: Scalars["Address"]["output"];
  chain: Chain;
  historicalState: UserHistory;
  id: Scalars["ID"]["output"];
  marketPositions: Array<MarketPosition>;
  state: UserState;
  tag: Maybe<Scalars["String"]["output"]>;
  transactions: Array<Transaction>;
  vaultPositions: Array<VaultPosition>;
};

/** User state history */
export type UserHistory = {
  __typename?: "UserHistory";
  /** Total borrow assets of all the user's market positions, in USD. */
  marketsBorrowAssetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the borrow side of the position since its inception, in USD for display purpose. */
  marketsBorrowPnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity of the borrow side of all the user's market positions, taking into account prices variation. */
  marketsBorrowRoeUsd: Maybe<Array<FloatDataPoint>>;
  /** Profit & Loss (from the collateral asset's price variation) of the collateral of the position since its inception, in USD for display purpose. */
  marketsCollateralPnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity of the collateral of all the user's market positions, taking into account prices variation. */
  marketsCollateralRoeUsd: Maybe<Array<FloatDataPoint>>;
  /** Total collateral of all the user's market positions, in USD. */
  marketsCollateralUsd: Maybe<Array<FloatDataPoint>>;
  /** Profit & Loss (from the collateral asset's price variation and loan interest) of the margin of the position since its inception, in USD for display purpose. */
  marketsMarginPnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity of the margin of all the user's market positions, taking into account prices variation. */
  marketsMarginRoeUsd: Maybe<Array<FloatDataPoint>>;
  /** Total margin of all the user's market positions, in USD. */
  marketsMarginUsd: Maybe<Array<FloatDataPoint>>;
  /** Profit (from the underlying asset's price variation) & Loss (from bad debt socialization) of all the user's market positions, in USD. */
  marketsPnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity of all the user's market positions, taking into account prices variation. */
  marketsRoeUsd: Maybe<Array<FloatDataPoint>>;
  /** Total supply assets of all the user's market positions, in USD. */
  marketsSupplyAssetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the supply side of the position since its inception, in USD for display purpose. */
  marketsSupplyPnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity of the supply side of all the user's market positions, taking into account prices variation. */
  marketsSupplyRoeUsd: Maybe<Array<FloatDataPoint>>;
  /** Total value of all the user's vault positions, in USD. */
  vaultsAssetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Profit (from the underlying asset's price variation) & Loss (from bad debt socialization) of all the user's vault positions, in USD. */
  vaultsPnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity of all the user's vault positions, taking into account prices variation. */
  vaultsRoeUsd: Maybe<Array<FloatDataPoint>>;
};

/** User state history */
export type UserHistoryMarketsBorrowAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsBorrowPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsBorrowRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsCollateralPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsCollateralRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsCollateralUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsMarginPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsMarginRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsMarginUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsSupplyAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsSupplyPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryMarketsSupplyRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryVaultsAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryVaultsPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state history */
export type UserHistoryVaultsRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** User state */
export type UserState = {
  __typename?: "UserState";
  /** Total borrow assets of all the user's market positions, in USD. */
  marketsBorrowAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the borrow side of the position since its inception, in USD for display purpose. */
  marketsBorrowPnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the borrow side of all the user's market positions, taking into account prices variation. */
  marketsBorrowRoeUsd: Maybe<Scalars["Float"]["output"]>;
  /** Profit & Loss (from the collateral asset's price variation) of the collateral of the position since its inception, in USD for display purpose. */
  marketsCollateralPnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the collateral of all the user's market positions, taking into account prices variation. */
  marketsCollateralRoeUsd: Maybe<Scalars["Float"]["output"]>;
  /** Total collateral of all the user's market positions, in USD. */
  marketsCollateralUsd: Maybe<Scalars["Float"]["output"]>;
  /** Profit & Loss (from the collateral asset's price variation and loan interest) of the margin of the position since its inception, in USD for display purpose. */
  marketsMarginPnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the margin of all the user's market positions, taking into account prices variation. */
  marketsMarginRoeUsd: Maybe<Scalars["Float"]["output"]>;
  /** Total margin of all the user's market positions, in USD. */
  marketsMarginUsd: Maybe<Scalars["Float"]["output"]>;
  /** Profit (from the underlying asset's price variation) & Loss (from bad debt socialization) of all the user's market positions, in USD. */
  marketsPnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of all the user's market positions, taking into account prices variation. */
  marketsRoeUsd: Maybe<Scalars["Float"]["output"]>;
  /** Total supply assets of all the user's market positions, in USD. */
  marketsSupplyAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** Profit & Loss (from the loan asset's price variation and interest) of the supply side of the position since its inception, in USD for display purpose. */
  marketsSupplyPnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the supply side of all the user's market positions, taking into account prices variation. */
  marketsSupplyRoeUsd: Maybe<Scalars["Float"]["output"]>;
  /** Total value of all the user's vault positions, in USD. */
  vaultsAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** Profit (from the underlying asset's price variation) & Loss (from bad debt socialization) of all the user's vault positions, in USD. */
  vaultsPnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of all the user's vault positions, taking into account prices variation. */
  vaultsRoeUsd: Maybe<Scalars["Float"]["output"]>;
};

/** Filtering options for users. AND operator is used for multiple filters, while OR operator is used for multiple values in the same filter. */
export type UsersFilters = {
  /** Filter by user address. Case insensitive. */
  address_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by token contract address. Case insensitive. */
  assetAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by asset id */
  assetId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by token symbol */
  assetSymbol_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  /** Filter by user id */
  id_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by market id */
  marketId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by market unique key */
  marketUniqueKey_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Filter by MetaMorpho vault address. Case insensitive. */
  vaultAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by MetaMorpho vault id. */
  vaultId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export enum UsersOrderBy {
  Address = "Address",
}

/** MetaMorpho Vaults */
export type Vault = {
  __typename?: "Vault";
  address: Scalars["Address"]["output"];
  /** Vault admin events on the vault */
  adminEvents: Maybe<PaginatedVaultAdminEvent>;
  /** Vault allocators */
  allocators: Maybe<Array<VaultAllocator>>;
  asset: Asset;
  chain: Chain;
  creationBlockNumber: Scalars["Int"]["output"];
  creationTimestamp: Scalars["BigInt"]["output"];
  creatorAddress: Maybe<Scalars["Address"]["output"]>;
  /**
   * Daily vault APY
   * @deprecated Use dailyApys instead.
   */
  dailyApy: Maybe<Scalars["Float"]["output"]>;
  /** Daily vault APYs */
  dailyApys: Maybe<VaultApyAggregates>;
  factory: VaultFactory;
  historicalState: VaultHistory;
  id: Scalars["ID"]["output"];
  /** Vault liquidity */
  liquidity: Maybe<VaultLiquidity>;
  metadata: Maybe<VaultMetadata>;
  /**
   * Monthly vault APY
   * @deprecated Use monthlyApys instead.
   */
  monthlyApy: Maybe<Scalars["Float"]["output"]>;
  /** Monthly vault APYs */
  monthlyApys: Maybe<VaultApyAggregates>;
  name: Scalars["String"]["output"];
  /** Vault pending caps */
  pendingCaps: Maybe<Array<VaultPendingCap>>;
  /** Public allocator configuration */
  publicAllocatorConfig: Maybe<PublicAllocatorConfig>;
  /** Risk related data on the vault */
  riskAnalysis: Maybe<Array<RiskAnalysis>>;
  state: Maybe<VaultState>;
  symbol: Scalars["String"]["output"];
  /** Vault warnings */
  warnings: Maybe<Array<VaultWarning>>;
  /**
   * Weekly vault APY
   * @deprecated Use weeklyApys instead.
   */
  weeklyApy: Maybe<Scalars["Float"]["output"]>;
  /** Weekly vault APYs */
  weeklyApys: Maybe<VaultApyAggregates>;
  whitelisted: Scalars["Boolean"]["output"];
};

/** MetaMorpho Vaults */
export type VaultAdminEventsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<VaultAdminEventsFilters>;
};

/** Meta Morpho vault event data */
export type VaultAdminEvent = {
  __typename?: "VaultAdminEvent";
  data: Maybe<VaultAdminEventData>;
  hash: Scalars["HexString"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  type: Scalars["String"]["output"];
};

export type VaultAdminEventData =
  | CapEventData
  | OwnershipEventData
  | ReallocateSupplyEventData
  | ReallocateWithdrawEventData
  | RevokeCapEventData
  | RevokePendingMarketRemovalEventData
  | SetCuratorEventData
  | SetFeeEventData
  | SetFeeRecipientEventData
  | SetGuardianEventData
  | SetIsAllocatorEventData
  | SetSkimRecipientEventData
  | SetSupplyQueueEventData
  | SetWithdrawQueueEventData
  | SkimEventData
  | TimelockEventData;

/** Filtering options for vault admin events. AND operator is used for multiple filters, while OR operator is used for multiple values in the same filter. */
export type VaultAdminEventsFilters = {
  /** Filter by event type */
  type_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

/** MetaMorpho vault allocation */
export type VaultAllocation = {
  __typename?: "VaultAllocation";
  enabled: Scalars["Boolean"]["output"];
  id: Scalars["ID"]["output"];
  market: Market;
  /** Pending maximum amount of asset that can be supplied on market by the vault, in market underlying token units */
  pendingSupplyCap: Maybe<Scalars["BigInt"]["output"]>;
  /** Pending maximum amount of asset that can be supplied on market by the vault, in USD for display purpose. */
  pendingSupplyCapUsd: Maybe<Scalars["Float"]["output"]>;
  /** Pending supply cap apply timestamp */
  pendingSupplyCapValidAt: Maybe<Scalars["BigInt"]["output"]>;
  removableAt: Scalars["BigInt"]["output"];
  /** Amount of asset supplied on market, in market underlying token units */
  supplyAssets: Scalars["BigInt"]["output"];
  /** Amount of asset supplied on market, in USD for display purpose. */
  supplyAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** Maximum amount of asset that can be supplied on market by the vault, in market underlying token units */
  supplyCap: Scalars["BigInt"]["output"];
  /** Maximum amount of asset that can be supplied on market by the vault, in USD for display purpose. */
  supplyCapUsd: Maybe<Scalars["Float"]["output"]>;
  /** Supply queue index */
  supplyQueueIndex: Maybe<Scalars["Int"]["output"]>;
  /** Amount of supplied shares on market. */
  supplyShares: Scalars["BigInt"]["output"];
  /** Withdraw queue index */
  withdrawQueueIndex: Maybe<Scalars["Int"]["output"]>;
};

/** MetaMorpho vault allocation history */
export type VaultAllocationHistory = {
  __typename?: "VaultAllocationHistory";
  market: Market;
  /** Amount of asset supplied on market, in market underlying token units */
  supplyAssets: Array<BigIntDataPoint>;
  /** Amount of asset supplied on market, in USD for display purpose. */
  supplyAssetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Maximum amount of asset that can be supplied on market by the vault, in market underlying token units */
  supplyCap: Array<BigIntDataPoint>;
  /** Maximum amount of asset that can be supplied on market by the vault, in USD for display purpose. */
  supplyCapUsd: Maybe<Array<FloatDataPoint>>;
};

/** MetaMorpho vault allocation history */
export type VaultAllocationHistorySupplyAssetsArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** MetaMorpho vault allocation history */
export type VaultAllocationHistorySupplyAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** MetaMorpho vault allocation history */
export type VaultAllocationHistorySupplyCapArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** MetaMorpho vault allocation history */
export type VaultAllocationHistorySupplyCapUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Vault allocator */
export type VaultAllocator = {
  __typename?: "VaultAllocator";
  /** Allocator adress. */
  address: Scalars["Address"]["output"];
  /** Allocator since block number */
  blockNumber: Scalars["BigInt"]["output"];
  /** Additional information about the address. */
  metadata: Maybe<PaginatedAddressMetadata>;
  /** Allocator since timestamp */
  timestamp: Scalars["BigInt"]["output"];
};

/** Vault APY aggregates */
export type VaultApyAggregates = {
  __typename?: "VaultApyAggregates";
  /** Average vault apy excluding rewards, before deducting the performance fee. */
  apy: Maybe<Scalars["Float"]["output"]>;
  /** Average vault APY including rewards, after deducting the performance fee. */
  netApy: Maybe<Scalars["Float"]["output"]>;
};

/** MetaMorpho Vault Factories */
export type VaultFactory = {
  __typename?: "VaultFactory";
  address: Scalars["Address"]["output"];
  chain: Chain;
  creationBlockNumber: Scalars["Int"]["output"];
  id: Scalars["ID"]["output"];
};

export type VaultFilters = {
  /** Filter by MetaMorpho vault address */
  address_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter out by MetaMorpho vault address */
  address_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by greater than or equal to given APY. */
  apy_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given APY. */
  apy_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by asset contract address */
  assetAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by asset id */
  assetId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by asset symbol */
  assetSymbol_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by asset tags. */
  assetTags_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  countryCode?: InputMaybe<Scalars["String"]["input"]>;
  /** Filter by MetaMorpho creator address */
  creatorAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by credora risk score greater than or equal to given value */
  credoraRiskScore_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by credora risk score lower than or equal to given value */
  credoraRiskScore_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by MetaMorpho current curator address */
  curatorAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by MetaMorphoFactory address */
  factoryAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by greater than or equal to given fee rate. */
  fee_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given fee rate. */
  fee_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by MetaMorpho vault id */
  id_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by markets in which the vault has positions. */
  marketUniqueKey_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by greater than or equal to given net APY. */
  netApy_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given net APY. */
  netApy_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by MetaMorpho owner address */
  ownerAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by lower than or equal to given public allocator fee in dollar. */
  publicAllocatorFeeUsd_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given public allocator fee. */
  publicAllocatorFee_lte?: InputMaybe<Scalars["Float"]["input"]>;
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Filter by MetaMorpho vault symbol */
  symbol_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by greater than or equal to given amount of total assets, in USD. */
  totalAssetsUsd_gte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by lower than or equal to given amount of total assets, in USD. */
  totalAssetsUsd_lte?: InputMaybe<Scalars["Float"]["input"]>;
  /** Filter by greater than or equal to given amount of total assets, in underlying token units. */
  totalAssets_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of total assets, in underlying token units. */
  totalAssets_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by greater than or equal to given amount of shares total supply. */
  totalSupply_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of shares total supply. */
  totalSupply_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  whitelisted?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Meta-Morpho vault history */
export type VaultHistory = {
  __typename?: "VaultHistory";
  /** All Time Vault APY excluding rewards, before deducting the performance fee. */
  allTimeApy: Maybe<Array<FloatDataPoint>>;
  /** All Time Vault APY including rewards, after deducting the performance fee. */
  allTimeNetApy: Maybe<Array<FloatDataPoint>>;
  /** Vault allocation on Morpho Blue markets. */
  allocation: Maybe<Array<VaultAllocationHistory>>;
  /** Vault APY excluding rewards, before deducting the performance fee. */
  apy: Maybe<Array<FloatDataPoint>>;
  /** Vault curator. */
  curator: Maybe<Array<AddressDataPoint>>;
  /** Daily Vault APY excluding rewards, before deducting the performance fee. */
  dailyApy: Maybe<Array<FloatDataPoint>>;
  /** Daily Vault APY including rewards, after deducting the performance fee. */
  dailyNetApy: Maybe<Array<FloatDataPoint>>;
  /** Vault performance fee. */
  fee: Maybe<Array<FloatDataPoint>>;
  /** Fee recipient. */
  feeRecipient: Maybe<Array<AddressDataPoint>>;
  /** Guardian. */
  guardian: Maybe<Array<AddressDataPoint>>;
  /** Monthly Vault APY excluding rewards, before deducting the performance fee. */
  monthlyApy: Maybe<Array<FloatDataPoint>>;
  /** Monthly Vault APY including rewards, after deducting the performance fee. */
  monthlyNetApy: Maybe<Array<FloatDataPoint>>;
  /** Vault APY including rewards, after deducting the performance fee. */
  netApy: Maybe<Array<FloatDataPoint>>;
  /** Vault APY excluding rewards, after deducting the performance fee. */
  netApyWithoutRewards: Maybe<Array<FloatDataPoint>>;
  /** Owner. */
  owner: Maybe<Array<AddressDataPoint>>;
  /** Quarterly Vault APY excluding rewards, before deducting the performance fee. */
  quarterlyApy: Maybe<Array<FloatDataPoint>>;
  /** Quarterly Vault APY including rewards, after deducting the performance fee. */
  quarterlyNetApy: Maybe<Array<FloatDataPoint>>;
  /** Value of WAD shares in assets */
  sharePrice: Maybe<Array<BigIntDataPoint>>;
  /** Value of WAD shares in USD */
  sharePriceUsd: Maybe<Array<FloatDataPoint>>;
  /** Skim recipient. */
  skimRecipient: Maybe<Array<AddressDataPoint>>;
  /** Total value of vault holdings, in underlying token units. */
  totalAssets: Maybe<Array<BigIntDataPoint>>;
  /** Total value of vault holdings, in USD for display purpose. */
  totalAssetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Vault shares total supply. */
  totalSupply: Maybe<Array<BigIntDataPoint>>;
  /** Weekly Vault APY excluding rewards, before deducting the performance fee. */
  weeklyApy: Maybe<Array<FloatDataPoint>>;
  /** Weekly Vault APY including rewards, after deducting the performance fee. */
  weeklyNetApy: Maybe<Array<FloatDataPoint>>;
  /** Yearly Vault APY excluding rewards, before deducting the performance fee. */
  yearlyApy: Maybe<Array<FloatDataPoint>>;
  /** Yearly Vault APY including rewards, after deducting the performance fee. */
  yearlyNetApy: Maybe<Array<FloatDataPoint>>;
};

/** Meta-Morpho vault history */
export type VaultHistoryAllTimeApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryAllTimeNetApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryCuratorArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryDailyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryDailyNetApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryFeeArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryFeeRecipientArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryGuardianArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryMonthlyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryMonthlyNetApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryNetApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryNetApyWithoutRewardsArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryOwnerArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryQuarterlyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryQuarterlyNetApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistorySharePriceArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistorySharePriceUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistorySkimRecipientArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryTotalAssetsArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryTotalAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryTotalSupplyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryWeeklyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryWeeklyNetApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryYearlyApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Meta-Morpho vault history */
export type VaultHistoryYearlyNetApyArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Vault Liquidity */
export type VaultLiquidity = {
  __typename?: "VaultLiquidity";
  /** Vault withdrawable liquidity in underlying. */
  underlying: Scalars["BigInt"]["output"];
  /** Vault withdrawable liquidity in USD. */
  usd: Scalars["Float"]["output"];
};

/** Vault metadata */
export type VaultMetadata = {
  __typename?: "VaultMetadata";
  curators: Array<VaultMetadataCurator>;
  description: Scalars["String"]["output"];
  forumLink: Maybe<Scalars["String"]["output"]>;
  image: Scalars["String"]["output"];
};

/** Vault metadata curator */
export type VaultMetadataCurator = {
  __typename?: "VaultMetadataCurator";
  image: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  url: Scalars["String"]["output"];
  verified: Scalars["Boolean"]["output"];
};

export enum VaultOrderBy {
  Address = "Address",
  Apy = "Apy",
  CredoraRiskScore = "CredoraRiskScore",
  Curator = "Curator",
  DailyApy = "DailyApy",
  DailyNetApy = "DailyNetApy",
  Fee = "Fee",
  Name = "Name",
  NetApy = "NetApy",
  TotalAssets = "TotalAssets",
  TotalAssetsUsd = "TotalAssetsUsd",
  TotalSupply = "TotalSupply",
}

/** Vault pending cap */
export type VaultPendingCap = {
  __typename?: "VaultPendingCap";
  market: Market;
  /** Pending supply cap */
  supplyCap: Scalars["BigInt"]["output"];
  /** Pending supply cap apply timestamp */
  validAt: Scalars["BigInt"]["output"];
};

/** MetaMorpho vault position */
export type VaultPosition = {
  __typename?: "VaultPosition";
  /**
   * Value of vault shares held, in underlying token units.
   * @deprecated Use `state.assets` instead.
   */
  assets: Scalars["BigInt"]["output"];
  /**
   * Value of vault shares held, in USD for display purpose.
   * @deprecated Use `state.assetsUsd` instead.
   */
  assetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** State history */
  historicalState: Maybe<VaultPositionHistory>;
  id: Scalars["ID"]["output"];
  /**
   * Amount of vault shares
   * @deprecated Use `state.shares` instead.
   */
  shares: Scalars["BigInt"]["output"];
  /** Current state */
  state: Maybe<VaultPositionState>;
  user: User;
  vault: Vault;
};

/** Filtering options for vault positions. AND operator is used for multiple filters, while OR operator is used for multiple values in the same filter. */
export type VaultPositionFilters = {
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Filter by greater than or equal to given amount of vault shares. */
  shares_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of vault shares. */
  shares_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by user address */
  userAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by user id */
  userId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by MetaMorpho vault address */
  vaultAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by MetaMorpho vault id */
  vaultId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

/** Vault position state history */
export type VaultPositionHistory = {
  __typename?: "VaultPositionHistory";
  /** Value of the position since its inception, in underlying assets. */
  assets: Maybe<Array<BigIntDataPoint>>;
  /** Value of the position since its inception, in USD. */
  assetsUsd: Maybe<Array<FloatDataPoint>>;
  /** Profit (from the underlying asset's price variation) & Loss (from bad debt socialization) of the position since its inception, in underlying assets. */
  pnl: Maybe<Array<BigIntDataPoint>>;
  /** Profit (from the underlying asset's price variation) & Loss (from bad debt socialization) of the position since its inception, in USD for display purposes. */
  pnlUsd: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity of the position since its inception. */
  roe: Maybe<Array<FloatDataPoint>>;
  /** Return Over Equity of the position since its inception, taking into account the underlying asset's price variation. */
  roeUsd: Maybe<Array<FloatDataPoint>>;
  /** Value of the position since its inception, in vault shares. */
  shares: Maybe<Array<BigIntDataPoint>>;
};

/** Vault position state history */
export type VaultPositionHistoryAssetsArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Vault position state history */
export type VaultPositionHistoryAssetsUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Vault position state history */
export type VaultPositionHistoryPnlArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Vault position state history */
export type VaultPositionHistoryPnlUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Vault position state history */
export type VaultPositionHistoryRoeArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Vault position state history */
export type VaultPositionHistoryRoeUsdArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

/** Vault position state history */
export type VaultPositionHistorySharesArgs = {
  options?: InputMaybe<TimeseriesOptions>;
};

export enum VaultPositionOrderBy {
  Shares = "Shares",
}

/** Vault position state */
export type VaultPositionState = {
  __typename?: "VaultPositionState";
  /** The latest supply assets indexed for this position. */
  assets: Maybe<Scalars["BigInt"]["output"]>;
  /** The latest supply assets indexed for this position, in USD. */
  assetsUsd: Maybe<Scalars["Float"]["output"]>;
  id: Scalars["ID"]["output"];
  /** Profit (from the collateral's price variation) & Loss (from the loan interest) of the position since its inception, in loan assets. */
  pnl: Maybe<Scalars["BigInt"]["output"]>;
  /** Profit (from the collateral's price variation) & Loss (from the loan interest) of the position since its inception, in USD. */
  pnlUsd: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the position since its inception. */
  roe: Maybe<Scalars["Float"]["output"]>;
  /** Return Over Equity of the position since its inception, taking into account the underlying asset's price variation. */
  roeUsd: Maybe<Scalars["Float"]["output"]>;
  /** The latest supply shares indexed for this position. */
  shares: Scalars["BigInt"]["output"];
  /** The latest update timestamp. */
  timestamp: Scalars["BigInt"]["output"];
};

/** Vault reallocate */
export type VaultReallocate = {
  __typename?: "VaultReallocate";
  assets: Scalars["BigInt"]["output"];
  blockNumber: Scalars["BigInt"]["output"];
  caller: Scalars["Address"]["output"];
  hash: Scalars["HexString"]["output"];
  id: Scalars["ID"]["output"];
  logIndex: Scalars["Int"]["output"];
  market: Market;
  shares: Scalars["BigInt"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  type: VaultReallocateType;
  vault: Vault;
};

/** Filtering options for vault reallocates. AND operator is used for multiple filters, while OR operator is used for multiple values in the same filter. */
export type VaultReallocateFilters = {
  /** Filter by greater than or equal to given amount of market assets, in underlying token units */
  assets_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of market assets, in underlying token units */
  assets_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by chain id */
  chainId_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  /** Filter by market id */
  marketId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by market unique key */
  marketUniqueKey_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by greater than or equal to given amount of market shares */
  shares_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by lower than or equal to given amount of market shares */
  shares_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  /** Filter by greater than or equal to given timestamp */
  timestamp_gte?: InputMaybe<Scalars["Int"]["input"]>;
  /** Filter by lower than or equal to given timestamp */
  timestamp_lte?: InputMaybe<Scalars["Int"]["input"]>;
  /** Filter by reallocate type */
  type_in?: InputMaybe<Array<VaultReallocateType>>;
  /** Filter by MetaMorpho vault address */
  vaultAddress_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  /** Filter by MetaMorpho vault id */
  vaultId_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export enum VaultReallocateOrderBy {
  Assets = "Assets",
  Shares = "Shares",
  Timestamp = "Timestamp",
}

export enum VaultReallocateType {
  ReallocateSupply = "ReallocateSupply",
  ReallocateWithdraw = "ReallocateWithdraw",
}

/** MetaMorpho vault state */
export type VaultState = {
  __typename?: "VaultState";
  /** All Time Vault APY excluding rewards, before deducting the performance fee. */
  allTimeApy: Maybe<Scalars["Float"]["output"]>;
  /** All Time Vault APY including rewards, after deducting the performance fee. */
  allTimeNetApy: Maybe<Scalars["Float"]["output"]>;
  /** Vault allocation on Morpho Blue markets. */
  allocation: Maybe<Array<VaultAllocation>>;
  /** Vault APY excluding rewards, before deducting the performance fee. */
  apy: Scalars["Float"]["output"];
  /** Vault curator address. */
  curator: Scalars["Address"]["output"];
  /** Additional information about the curator address. */
  curatorMetadata: Maybe<PaginatedAddressMetadata>;
  /**
   * Curators operating on this vault
   * @deprecated Work in progress
   */
  curators: Maybe<Array<Curator>>;
  /** Daily Vault APY excluding rewards, before deducting the performance fee. */
  dailyApy: Maybe<Scalars["Float"]["output"]>;
  /** Daily Vault APY including rewards, after deducting the performance fee. */
  dailyNetApy: Maybe<Scalars["Float"]["output"]>;
  /** Vault performance fee. */
  fee: Scalars["Float"]["output"];
  /** Fee recipient address. */
  feeRecipient: Scalars["Address"]["output"];
  /** Guardian address. */
  guardian: Scalars["Address"]["output"];
  /** Additional information about the guardian address. */
  guardianMetadata: Maybe<PaginatedAddressMetadata>;
  id: Scalars["ID"]["output"];
  /** Stores the total assets managed by this vault when the fee was last accrued, in underlying token units. */
  lastTotalAssets: Scalars["BigInt"]["output"];
  /** Monthly Vault APY excluding rewards, before deducting the performance fee. */
  monthlyApy: Maybe<Scalars["Float"]["output"]>;
  /** Monthly Vault APY including rewards, after deducting the performance fee. */
  monthlyNetApy: Maybe<Scalars["Float"]["output"]>;
  /** Vault APY including rewards and underlying yield, after deducting the performance fee. */
  netApy: Maybe<Scalars["Float"]["output"]>;
  /** Vault APY excluding rewards, after deducting the performance fee. */
  netApyWithoutRewards: Scalars["Float"]["output"];
  /** Owner address. */
  owner: Scalars["Address"]["output"];
  /** Additional information about the owner address. */
  ownerMetadata: Maybe<PaginatedAddressMetadata>;
  /** Pending guardian address. */
  pendingGuardian: Maybe<Scalars["Address"]["output"]>;
  /** Pending guardian apply timestamp. */
  pendingGuardianValidAt: Maybe<Scalars["BigInt"]["output"]>;
  /** Pending owner address. */
  pendingOwner: Maybe<Scalars["Address"]["output"]>;
  /** Pending timelock in seconds. */
  pendingTimelock: Maybe<Scalars["BigInt"]["output"]>;
  /** Pending timelock apply timestamp. */
  pendingTimelockValidAt: Maybe<Scalars["BigInt"]["output"]>;
  /** Quarterly Vault APY excluding rewards, before deducting the performance fee. */
  quarterlyApy: Maybe<Scalars["Float"]["output"]>;
  /** Quarterly Vault APY including rewards, after deducting the performance fee. */
  quarterlyNetApy: Maybe<Scalars["Float"]["output"]>;
  /** Vault state rewards */
  rewards: Maybe<Array<VaultStateReward>>;
  /** Value of WAD shares in assets */
  sharePrice: Maybe<Scalars["BigInt"]["output"]>;
  /** Value of WAD shares in USD */
  sharePriceUsd: Maybe<Scalars["Float"]["output"]>;
  /** Skim recipient address. */
  skimRecipient: Scalars["Address"]["output"];
  /** Timelock in seconds. */
  timelock: Scalars["BigInt"]["output"];
  /** Last update timestamp. */
  timestamp: Scalars["BigInt"]["output"];
  /** Total value of vault holdings, in underlying token units. */
  totalAssets: Scalars["BigInt"]["output"];
  /** Total value of vault holdings, in USD for display purpose. */
  totalAssetsUsd: Maybe<Scalars["Float"]["output"]>;
  /** Vault shares total supply. */
  totalSupply: Scalars["BigInt"]["output"];
  /** Weekly Vault APY excluding rewards, before deducting the performance fee. */
  weeklyApy: Maybe<Scalars["Float"]["output"]>;
  /** Weekly Vault APY including rewards, after deducting the performance fee. */
  weeklyNetApy: Maybe<Scalars["Float"]["output"]>;
  /** Yearly Vault APY excluding rewards, before deducting the performance fee. */
  yearlyApy: Maybe<Scalars["Float"]["output"]>;
  /** Yearly Vault APY including rewards, after deducting the performance fee. */
  yearlyNetApy: Maybe<Scalars["Float"]["output"]>;
};

/** MetaMorpho vault state rewards */
export type VaultStateReward = {
  __typename?: "VaultStateReward";
  /** Amount of reward tokens earned per supplied token (annualized). Scaled to reward asset decimals. */
  amountPerSuppliedToken: Scalars["BigInt"]["output"];
  asset: Asset;
  /** Rewards APR. */
  supplyApr: Maybe<Scalars["Float"]["output"]>;
  /** Amount of reward tokens distributed to MetaMorpho vault suppliers (annualized). Scaled to reward asset decimals. */
  yearlySupplyTokens: Scalars["BigInt"]["output"];
};

/** Meta Morpho vault transaction data */
export type VaultTransactionData = {
  __typename?: "VaultTransactionData";
  assets: Scalars["BigInt"]["output"];
  assetsUsd: Maybe<Scalars["Float"]["output"]>;
  shares: Scalars["BigInt"]["output"];
  vault: Vault;
};

/** Vault warning */
export type VaultWarning = {
  __typename?: "VaultWarning";
  level: WarningLevel;
  metadata: Maybe<CustomMetadata>;
  type: Scalars["String"]["output"];
};

export enum WarningLevel {
  Red = "RED",
  Yellow = "YELLOW",
}
