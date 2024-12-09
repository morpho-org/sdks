import * as Types from './types.js';

import { GraphQLClient, RequestOptions } from 'graphql-request';
import gql from 'graphql-tag';
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];

export const GetMarketDocument = gql`
    query getMarket($marketId: String!, $chainId: Int!) {
  marketByUniqueKey(uniqueKey: $marketId, chainId: $chainId) {
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
    `;

export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();

export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
    getMarket(variables: Types.GetMarketQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<Types.GetMarketQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<Types.GetMarketQuery>(GetMarketDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'getMarket', 'query', variables);
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;