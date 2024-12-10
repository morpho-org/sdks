import * as Types from './types.js';

import { GraphQLClient, RequestOptions } from 'graphql-request';
import gql from 'graphql-tag';
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];

export const GetMarketsDocument = gql`
    query getMarkets($chainId: Int!, $marketIds: [String!]) {
  markets(where: {chainId_in: [$chainId], uniqueKey_in: $marketIds}) {
    items {
      uniqueKey
      publicAllocatorSharedLiquidity {
        vault {
          address
        }
        allocationMarket {
          uniqueKey
        }
        assets
      }
      supplyingVaults {
        address
        state {
          allocation {
            market {
              uniqueKey
              loanAsset {
                address
              }
              targetWithdrawUtilization
            }
          }
        }
      }
    }
  }
}
    `;

export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();

export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
    getMarkets(variables: Types.GetMarketsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<Types.GetMarketsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<Types.GetMarketsQuery>(GetMarketsDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'getMarkets', 'query', variables);
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;