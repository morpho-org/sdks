import { ChainId, getChainAddresses } from "@morpho-org/blue-sdk";
import { TypedDataDefinition } from "viem";

export interface AuthorizationArgs {
  authorizer: string;
  authorized: string;
  isAuthorized: boolean;
  nonce: bigint;
  deadline: bigint;
}

const authorizationTypes = {
  Authorization: [
    { name: "authorizer", type: "address" },
    { name: "authorized", type: "address" },
    { name: "isAuthorized", type: "bool" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export const getAuthorizationTypedData = (
  { authorizer, authorized, isAuthorized, nonce, deadline }: AuthorizationArgs,
  chainId: ChainId,
): TypedDataDefinition<typeof authorizationTypes, "Authorization"> => {
  return {
    domain: {
      chainId: chainId,
      verifyingContract: getChainAddresses(chainId).morpho,
    },
    types: authorizationTypes,
    message: {
      authorizer,
      authorized,
      isAuthorized,
      nonce,
      deadline,
    },
    primaryType: "Authorization",
  };
};
