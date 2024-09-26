import { ChainId, getChainAddresses } from "@morpho-org/blue-sdk";

import { HashTypedDataParameters, hashTypedData } from "viem";
import { SignatureMessage } from "./types";

export interface ManagerApprovalSignatureArgs extends Record<string, unknown> {
  authorizer: string;
  authorized: string;
  isAuthorized: boolean;
  nonce: bigint;
  deadline: bigint;
}

export const getManagerApprovalMessage = (
  args: ManagerApprovalSignatureArgs,
  chainId: ChainId,
): SignatureMessage => {
  const domain = {
    chainId: chainId,
    verifyingContract: getChainAddresses(chainId).morpho,
  };

  const types = {
    Authorization: [
      {
        name: "authorizer",
        type: "address",
      },
      {
        name: "authorized",
        type: "address",
      },
      {
        name: "isAuthorized",
        type: "bool",
      },
      {
        name: "nonce",
        type: "uint256",
      },
      {
        name: "deadline",
        type: "uint256",
      },
    ],
  };

  const data: HashTypedDataParameters = {
    types,
    message: args,
    domain,
    primaryType: "Authorization",
  };

  return {
    data,
    hash: hashTypedData(data),
  };
};
