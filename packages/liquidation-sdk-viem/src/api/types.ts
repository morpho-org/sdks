import type * as Types from "@morpho-org/blue-api-sdk";

export type GetLiquidatablePositionsQueryVariables = Types.Exact<{
  chainId: Types.Scalars["Int"]["input"];
  wNative: Types.Scalars["String"]["input"];
  marketIds?: Types.InputMaybe<
    Array<Types.Scalars["String"]["input"]> | Types.Scalars["String"]["input"]
  >;
  first?: Types.InputMaybe<Types.Scalars["Int"]["input"]>;
}>;

export type GetLiquidatablePositionsQuery = {
  __typename?: "Query";
  assetByAddress: { __typename?: "Asset"; priceUsd: number | null };
  marketPositions: {
    __typename?: "PaginatedMarketPositions";
    items: Array<{
      __typename?: "MarketPosition";
      user: {
        __typename?: "User";
        address: Types.Scalars["Address"]["output"];
      };
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
