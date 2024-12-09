import type * as Types from "@morpho-org/blue-api-sdk";

export type GetMarketQueryVariables = Types.Exact<{
  marketId: Types.Scalars["String"]["input"];
  chainId: Types.Scalars["Int"]["input"];
}>;

export type GetMarketQuery = {
  __typename?: "Query";
  marketByUniqueKey: {
    __typename?: "Market";
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
  };
};
