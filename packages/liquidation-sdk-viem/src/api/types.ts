import type * as Types from "@morpho-org/blue-api-sdk";

export type GetAssetByAddressQueryVariables = Types.Exact<{
  chainId: Types.Scalars["Int"]["input"];
  address: Types.Scalars["String"]["input"];
}>;

export type GetAssetByAddressQuery = {
  __typename?: "Query";
  assetByAddress: { __typename?: "Asset"; priceUsd: number | null };
};

export type GetLiquidatablePositionsQueryVariables = Types.Exact<{
  chainId: Types.Scalars["Int"]["input"];
  marketIds?: Types.InputMaybe<
    Array<Types.Scalars["String"]["input"]> | Types.Scalars["String"]["input"]
  >;
  skip?: Types.InputMaybe<Types.Scalars["Int"]["input"]>;
  first?: Types.InputMaybe<Types.Scalars["Int"]["input"]>;
  orderBy?: Types.InputMaybe<Types.MarketPositionOrderBy>;
  orderDirection?: Types.InputMaybe<Types.OrderDirection>;
}>;

export type GetLiquidatablePositionsQuery = {
  __typename?: "Query";
  marketPositions: {
    __typename?: "PaginatedMarketPositions";
    pageInfo: {
      __typename?: "PageInfo";
      count: number;
      countTotal: number;
      limit: number;
      skip: number;
    } | null;
    items: Array<{
      __typename?: "MarketPosition";
      healthFactor: number | null;
      user: {
        __typename?: "User";
        address: Types.Scalars["Address"]["output"];
      };
      market: {
        __typename?: "Market";
        uniqueKey: Types.Scalars["MarketId"]["output"];
      };
      state: {
        __typename?: "MarketPositionState";
        borrowShares: Types.Scalars["BigInt"]["output"];
        collateral: Types.Scalars["BigInt"]["output"];
        supplyShares: Types.Scalars["BigInt"]["output"];
      } | null;
    }> | null;
  };
};

export type GetMarketsAssetsQueryVariables = Types.Exact<{
  chainId: Types.Scalars["Int"]["input"];
  marketIds:
    | Array<Types.Scalars["String"]["input"]>
    | Types.Scalars["String"]["input"];
  skip?: Types.InputMaybe<Types.Scalars["Int"]["input"]>;
  first?: Types.InputMaybe<Types.Scalars["Int"]["input"]>;
  orderBy?: Types.InputMaybe<Types.MarketOrderBy>;
  orderDirection?: Types.InputMaybe<Types.OrderDirection>;
}>;

export type GetMarketsAssetsQuery = {
  __typename?: "Query";
  markets: {
    __typename?: "PaginatedMarkets";
    pageInfo: {
      __typename?: "PageInfo";
      count: number;
      countTotal: number;
      limit: number;
      skip: number;
    } | null;
    items: Array<{
      __typename?: "Market";
      uniqueKey: Types.Scalars["MarketId"]["output"];
      collateralAsset: {
        __typename?: "Asset";
        address: Types.Scalars["Address"]["output"];
        decimals: number;
        symbol: string;
        priceUsd: number | null;
        spotPriceEth: number | null;
      } | null;
      loanAsset: {
        __typename?: "Asset";
        address: Types.Scalars["Address"]["output"];
        decimals: number;
        symbol: string;
        priceUsd: number | null;
        spotPriceEth: number | null;
      };
    }> | null;
  };
};

export type GetWhitelistedMarketIdsQueryVariables = Types.Exact<{
  chainId: Types.Scalars["Int"]["input"];
}>;

export type GetWhitelistedMarketIdsQuery = {
  __typename?: "Query";
  markets: {
    __typename?: "PaginatedMarkets";
    items: Array<{
      __typename?: "Market";
      uniqueKey: Types.Scalars["MarketId"]["output"];
    }> | null;
  };
};

export type MarketPositionFragment = {
  __typename?: "MarketPosition";
  user: { __typename?: "User"; address: Types.Scalars["Address"]["output"] };
  market: {
    __typename?: "Market";
    uniqueKey: Types.Scalars["MarketId"]["output"];
    collateralAsset: {
      __typename?: "Asset";
      address: Types.Scalars["Address"]["output"];
      decimals: number;
      symbol: string;
      priceUsd: number | null;
      spotPriceEth: number | null;
    } | null;
    loanAsset: {
      __typename?: "Asset";
      address: Types.Scalars["Address"]["output"];
      decimals: number;
      symbol: string;
      priceUsd: number | null;
      spotPriceEth: number | null;
    };
  };
};
