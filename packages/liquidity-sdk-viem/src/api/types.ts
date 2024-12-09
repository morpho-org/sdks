import type * as Types from "@morpho-org/blue-api-sdk";

export type GetMarketsQueryVariables = Types.Exact<{
  chainId: Types.Scalars["Int"]["input"];
  marketIds?: Types.InputMaybe<
    Array<Types.Scalars["String"]["input"]> | Types.Scalars["String"]["input"]
  >;
}>;

export type GetMarketsQuery = {
  __typename?: "Query";
  markets: {
    __typename?: "PaginatedMarkets";
    items: Array<{
      __typename?: "Market";
      uniqueKey: Types.Scalars["MarketId"]["output"];
      publicAllocatorSharedLiquidity: Array<{
        __typename?: "PublicAllocatorSharedLiquidity";
        assets: Types.Scalars["BigInt"]["output"];
        vault: {
          __typename?: "Vault";
          address: Types.Scalars["Address"]["output"];
        };
        allocationMarket: {
          __typename?: "Market";
          uniqueKey: Types.Scalars["MarketId"]["output"];
        };
      }> | null;
      supplyingVaults: Array<{
        __typename?: "Vault";
        address: Types.Scalars["Address"]["output"];
        state: {
          __typename?: "VaultState";
          allocation: Array<{
            __typename?: "VaultAllocation";
            market: {
              __typename?: "Market";
              uniqueKey: Types.Scalars["MarketId"]["output"];
              targetWithdrawUtilization: Types.Scalars["BigInt"]["output"];
              loanAsset: {
                __typename?: "Asset";
                address: Types.Scalars["Address"]["output"];
              };
            };
          }> | null;
        } | null;
      }> | null;
    }> | null;
  };
};
