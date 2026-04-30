import { getChainAddresses } from "@morpho-org/blue-sdk";
import type { Action } from "@morpho-org/bundler-sdk-viem";
import { type Address, isAddressEqual } from "viem";
import {
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  type Permit2Action,
  type PermitAction,
  type PermitArgs,
} from "../../types/index.js";

interface GetRequirementsActionParams {
  chainId: number;
  asset: Address;
  amount: bigint;
  requirementSignature: {
    args: PermitArgs;
    action: PermitAction | Permit2Action;
  };
}

/**
 * Get the actions required to transfer the asset based on the requirement signature.
 */
export const getRequirementsAction = ({
  chainId,
  asset,
  amount,
  requirementSignature,
}: GetRequirementsActionParams): Action[] => {
  if (!isAddressEqual(requirementSignature.args.asset, asset)) {
    throw new DepositAssetMismatchError(asset, requirementSignature.args.asset);
  }

  if (requirementSignature.args.amount !== amount) {
    throw new DepositAmountMismatchError(
      amount,
      requirementSignature.args.amount,
    );
  }

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  if (requirementSignature.action.type === "permit2") {
    if (!("expiration" in requirementSignature.args)) {
      throw new Error("Expiration is not defined");
    }
    return [
      {
        type: "approve2",
        args: [
          requirementSignature.args.owner,
          {
            details: {
              token: requirementSignature.args.asset,
              amount: requirementSignature.args.amount,
              nonce: Number(requirementSignature.args.nonce),
              expiration: Number(requirementSignature.args.expiration),
            },
            sigDeadline: requirementSignature.args.deadline,
          },
          requirementSignature.args.signature,
          false /* skipRevert */,
        ],
      },
      {
        type: "transferFrom2",
        args: [asset, amount, generalAdapter1, false /* skipRevert */],
      },
    ];
  }

  return [
    {
      type: "permit",
      args: [
        requirementSignature.args.owner,
        requirementSignature.args.asset,
        requirementSignature.args.amount,
        requirementSignature.args.deadline,
        requirementSignature.args.signature,
        false /* skipRevert */,
      ],
    },
    {
      type: "erc20TransferFrom",
      args: [asset, amount, generalAdapter1, false /* skipRevert */],
    },
  ];
};
