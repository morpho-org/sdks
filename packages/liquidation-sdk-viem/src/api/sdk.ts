import * as Types from './types.js';

import { GraphQLClient, RequestOptions } from 'graphql-request';
import gql from 'graphql-tag';
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];
export const MarketPositionFragmentDoc = gql`
    fragment MarketPosition on MarketPosition {
  user {
    address
  }
  market {
    uniqueKey
    collateralAsset {
      address
      decimals
      symbol
      priceUsd
      spotPriceEth
    }
    loanAsset {
      address
      decimals
      symbol
      priceUsd
      spotPriceEth
    }
  }
}
    `;
export const GetLiquidatablePositionsDocument = gql`
    query getLiquidatablePositions($chainId: Int!, $wNative: String!, $marketIds: [String!], $first: Int = 1000) {
  assetByAddress(chainId: $chainId, address: $wNative) {
    priceUsd
  }
  marketPositions(
    first: $first
    where: {chainId_in: [$chainId], marketUniqueKey_in: $marketIds, healthFactor_lte: 1}
  ) {
    items {
      ...MarketPosition
    }
  }
}
    ${MarketPositionFragmentDoc}`;
export const GetWhitelistedMarketIdsDocument = gql`
    query getWhitelistedMarketIds($chainId: Int!) {
  markets(where: {chainId_in: [$chainId], whitelisted: true}) {
    items {
      uniqueKey
    }
  }
}
    `;

export const GetMarketAssetsDocument = gql `
    query getMarketAsset($chainId: Int!, $marketId: String!) {
  markets(where: {chainId_in: [$chainId], uniqueKey_in: [$marketId]}) {
    items {
      collateralAsset {
        address
        decimals
        symbol
        priceUsd
        spotPriceEth
      }
      loanAsset {
        address
        decimals
        symbol
        priceUsd
        spotPriceEth
      }
    }
  } 
}
`;

export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();

export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
    getLiquidatablePositions(variables: Types.GetLiquidatablePositionsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<Types.GetLiquidatablePositionsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<Types.GetLiquidatablePositionsQuery>(GetLiquidatablePositionsDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'getLiquidatablePositions', 'query', variables);
    },
    getWhitelistedMarketIds(variables: Types.GetWhitelistedMarketIdsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<Types.GetWhitelistedMarketIdsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<Types.GetWhitelistedMarketIdsQuery>(GetWhitelistedMarketIdsDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'getWhitelistedMarketIds', 'query', variables);
    },
    getMarketAssets(variables: Types.GetMarketAssetsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<Types.GetMarketAssetsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<Types.GetMarketAssetsQuery>(GetMarketAssetsDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'getMarketAssets', 'query', variables);
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;