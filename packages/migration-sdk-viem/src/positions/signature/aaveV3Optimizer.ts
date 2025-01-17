import {
  type Address,
  type ChainId,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";

import type { TypedDataDefinition } from "viem";
import MIGRATION_ADDRESSES from "../../config.js";
import { MigratableProtocol } from "../../types/index.js";

interface MorphoAaveV3ManagerApprovalArgs {
  delegator: Address;
  manager: Address;
  nonce: bigint;
  deadline: bigint;
  isAllowed: boolean;
}

const morphoAaveV3ManagerApprovalTypes = {
  Authorization: [
    {
      name: "delegator",
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
      name: "deadline",
      type: "uint256",
    },
  ],
} as const;

export const getMorphoAaveV3ManagerApprovalTypedData = (
  args: MorphoAaveV3ManagerApprovalArgs,
  chainId: ChainId,
): TypedDataDefinition<
  typeof morphoAaveV3ManagerApprovalTypes,
  "Authorization"
> => {
  const migrationAddresses =
    MIGRATION_ADDRESSES[chainId][MigratableProtocol.aaveV3Optimizer];

  if (!migrationAddresses) throw new UnsupportedChainIdError(chainId);

  return {
    domain: {
      name: "Morpho-AaveV3",
      chainId,
      verifyingContract: migrationAddresses.morpho.address,
      version: "0",
    },
    types: morphoAaveV3ManagerApprovalTypes,
    message: args,
    primaryType: "Authorization",
  };
};
