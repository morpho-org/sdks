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
  asset: Address;
  amount: bigint;
  recipient: Address;
  requirementSignature: {
    args: PermitArgs;
    action: PermitAction | Permit2Action;
  };
}

/**
 * Encodes the bundler actions that consume a pre-signed permit / permit2 requirement and pull
 * the asset to `recipient`.
 *
 * Permit2 path emits `approve2` + `transferFrom2`; classic permit path emits `permit` +
 * `erc20TransferFrom`. The signed `asset` and `amount` must match the pulled `asset` and
 * `amount` exactly, otherwise the function throws so the caller does not silently spend a
 * wider-than-expected approval.
 *
 * Exposed on the public surface so action builders outside this package (e.g. the Aave V3
 * → Vault V2 migration builder in `morpho-apps`) can route the pulled asset to a non-default
 * `recipient` such as the `AaveV3CoreMigrationAdapter` rather than `GeneralAdapter1`.
 *
 * @param params.asset - The ERC-20 to pull.
 * @param params.amount - The amount to pull, in the asset's smallest unit.
 * @param params.recipient - The address that receives the transfer.
 * @param params.requirementSignature - The signed permit / permit2 to apply before the transfer.
 * @returns A pair of bundler `Action`s: a permit / approve2 followed by the transfer.
 * @throws {DepositAssetMismatchError} when the signed asset differs from `asset`.
 * @throws {DepositAmountMismatchError} when the signed amount differs from `amount`.
 */
export const getRequirementsAction = ({
  asset,
  amount,
  recipient,
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
        args: [asset, amount, recipient, false /* skipRevert */],
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
      args: [asset, amount, recipient, false /* skipRevert */],
    },
  ];
};
