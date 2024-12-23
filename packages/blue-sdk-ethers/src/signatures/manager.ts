import { type ChainId, getChainAddresses } from "@morpho-org/blue-sdk";

import type { SignatureMessage } from "./types";
import { getMessage } from "./utils";

export interface ManagerApprovalSignatureArgs {
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
    chainId: chainId.toString(),
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

  return getMessage(domain, types, args);
};
