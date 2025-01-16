import type { Address, ChainId } from "@morpho-org/blue-sdk";

import type { TypedDataDefinition } from "viem";

interface CompoundV3ManagerApprovalArgs {
  instance: Address;
  name: string;
  owner: Address;
  manager: Address;
  isAllowed: boolean;
  nonce: bigint;
  expiry: bigint;
}

const compoundV3ManagerApprovalTypes = {
  Authorization: [
    {
      name: "owner",
      type: "address",
    },
    {
      name: "manager",
      type: "address",
    },
    {
      name: "isAllowed",
      type: "bool",
    },
    {
      name: "nonce",
      type: "uint256",
    },
    {
      name: "expiry",
      type: "uint256",
    },
  ],
} as const;

export const getCompoundV3ManagerApprovalMessage = (
  { instance, name, ...args }: CompoundV3ManagerApprovalArgs,
  chainId: ChainId,
): TypedDataDefinition<
  typeof compoundV3ManagerApprovalTypes,
  "Authorization"
> => {
  return {
    domain: {
      name,
      chainId,
      verifyingContract: instance,
      version: "0",
    },
    message: args,
    primaryType: "Authorization",
    types: compoundV3ManagerApprovalTypes,
  };
};
