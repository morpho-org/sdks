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
export const GetAssetByAddressDocument = gql`
    query getAssetByAddress($chainId: Int!, $address: String!) {
  assetByAddress(chainId: $chainId, address: $address) {
    priceUsd
  }
}
    `;
export const GetLiquidatablePositionsDocument = gql`
    query getLiquidatablePositions($chainId: Int!, $marketIds: [String!], $skip: Int, $first: Int = 100, $orderBy: MarketPositionOrderBy, $orderDirection: OrderDirection) {
  marketPositions(
    skip: $skip
    first: $first
    where: {chainId_in: [$chainId], marketUniqueKey_in: $marketIds, healthFactor_lte: 1}
    orderBy: $orderBy
    orderDirection: $orderDirection
  ) {
    pageInfo {
      count
      countTotal
      limit
      skip
    }
    items {
      healthFactor
      user {
        address
      }
      market {
        uniqueKey
      }
      state {
        borrowShares
        collateral
        supplyShares
      }
    }
  }
}
    `;
export const GetMarketsAssetsDocument = gql`
    query getMarketsAssets($chainId: Int!, $marketIds: [String!]!, $skip: Int, $first: Int = 100, $orderBy: MarketOrderBy, $orderDirection: OrderDirection) {
  markets(
    skip: $skip
    first: $first
    where: {chainId_in: [$chainId], uniqueKey_in: $marketIds}
    orderBy: $orderBy
    orderDirection: $orderDirection
  ) {
    pageInfo {
      count
      countTotal
      limit
      skip
    }
    items {
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
}
    `;
export const GetWhitelistedMarketIdsDocument = gql`
    query getWhitelistedMarketIds($chainId: Int!) {
  markets(where: {chainId_in: [$chainId], whitelisted: true}) {
    items {
      uniqueKey
    }
  }
}
    `;

export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();

export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
    getAssetByAddress(variables: Types.GetAssetByAddressQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<Types.GetAssetByAddressQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<Types.GetAssetByAddressQuery>(GetAssetByAddressDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'getAssetByAddress', 'query', variables);
    },
    getLiquidatablePositions(variables: Types.GetLiquidatablePositionsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<Types.GetLiquidatablePositionsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<Types.GetLiquidatablePositionsQuery>(GetLiquidatablePositionsDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'getLiquidatablePositions', 'query', variables);
    },
    getMarketsAssets(variables: Types.GetMarketsAssetsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<Types.GetMarketsAssetsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<Types.GetMarketsAssetsQuery>(GetMarketsAssetsDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'getMarketsAssets', 'query', variables);
    },
    getWhitelistedMarketIds(variables: Types.GetWhitelistedMarketIdsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<Types.GetWhitelistedMarketIdsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<Types.GetWhitelistedMarketIdsQuery>(GetWhitelistedMarketIdsDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'getWhitelistedMarketIds', 'query', variables);
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;