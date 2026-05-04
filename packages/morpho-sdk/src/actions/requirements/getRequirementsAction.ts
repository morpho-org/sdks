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
 * Encodes the bundler actions that consume a pre-signed permit / permit2 requirement and pull
 * the asset into `GeneralAdapter1`.
 *
 * Permit2 path emits `approve2` + `transferFrom2`; classic permit path emits `permit` +
 * `erc20TransferFrom`. The signed `asset` and `amount` must match the pulled `asset` and
 * `amount` exactly, otherwise the function throws so the caller does not silently spend a
 * wider-than-expected approval.
 *
 * @param params.chainId - The chain the bundle targets (used to resolve `GeneralAdapter1`).
 * @param params.asset - The ERC-20 to pull into the adapter.
 * @param params.amount - The amount to pull, in the asset's smallest unit.
 * @param params.requirementSignature - The signed permit / permit2 to apply before the transfer.
 * @returns A pair of bundler `Action`s: a permit / approve2 followed by the transfer.
 * @throws {DepositAssetMismatchError} when the signed asset differs from `asset`.
 * @throws {DepositAmountMismatchError} when the signed amount differs from `amount`.
 * @example
 * ```ts
 * import { getRequirementsAction } from "@morpho-org/morpho-sdk";
 *
 * const actions = getRequirementsAction({
 *   chainId: 1,
 *   asset: USDC,
 *   amount: 1_000_000n,
 *   requirementSignature,
 * });
 * // actions satisfies Action[]
 * ```
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
