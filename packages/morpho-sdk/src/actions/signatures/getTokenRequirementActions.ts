import { type Address, isAddressEqual } from "viem";
import type { Action } from "../../bundler/index.js";
import {
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  isPermit2TransferFromSignature,
  Permit2ExpirationMissingError,
  type PermitRequirementSignature,
  UnexpectedRequirementSignatureError,
} from "../../types/index.js";

interface GetTokenRequirementActionsParams {
  asset: Address;
  amount: bigint;
  recipient: Address;
  requirementSignature?: PermitRequirementSignature;
}

/**
 * Encodes the bundler actions that pull the asset to `recipient`, optionally consuming a
 * pre-signed permit / permit2 requirement first.
 *
 * Permit2 path emits `approve2` + `transferFrom2`; classic permit path emits `permit` +
 * `erc20TransferFrom`. When no signature is provided, the function emits a plain
 * `erc20TransferFrom` against an existing ERC-20 allowance.
 *
 * The signed `asset` and `amount` must match the pulled `asset` and `amount` exactly, otherwise
 * the function throws so the caller does not silently spend a wider-than-expected approval.
 *
 * @param params.asset - The ERC-20 to pull.
 * @param params.amount - The amount to pull, in the asset's smallest unit.
 * @param params.recipient - The address that receives the transfer.
 * @param params.requirementSignature - Optional signed permit / permit2 to apply before the transfer.
 * @returns Bundler `Action`s needed to pull the token.
 * @throws {DepositAssetMismatchError} when the signed asset differs from `asset`.
 * @throws {DepositAmountMismatchError} when the signed amount differs from `amount`.
 * @throws {UnexpectedRequirementSignatureError} when passed a BlueBundlesV1-only SignatureTransfer result.
 * @throws {Permit2ExpirationMissingError} when `action.type === "permit2"` but `args.expiration` is missing.
 * @example
 * ```ts
 * import { createWalletClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getTokenRequirementActions } from "@morpho-org/morpho-sdk";
 *
 * const walletClient = createWalletClient({
 *   chain: mainnet,
 *   transport: http(),
 *   account: borrower,
 * });
 *
 * // `requirement` comes from a requirement helper; signing produces a `RequirementSignature`.
 * const requirementSignature = await requirement.sign(walletClient, borrower);
 *
 * const actions = getTokenRequirementActions({
 *   asset: loanToken,
 *   amount: 1_000_000n,
 *   recipient: generalAdapter1,
 *   requirementSignature,
 * });
 * // actions satisfies Action[]
 * // - permit2 path: [{ type: "approve2", ... }, { type: "transferFrom2", ... }]
 * // - classic permit path: [{ type: "permit", ... }, { type: "erc20TransferFrom", ... }]
 * // - no signature: [{ type: "erc20TransferFrom", ... }]
 * ```
 */
export const getTokenRequirementActions = ({
  asset,
  amount,
  recipient,
  requirementSignature,
}: GetTokenRequirementActionsParams): Action[] => {
  if (requirementSignature == null) {
    return [
      {
        type: "erc20TransferFrom",
        args: [asset, amount, recipient, false /* skipRevert */],
      },
    ];
  }

  if (isPermit2TransferFromSignature(requirementSignature)) {
    throw new UnexpectedRequirementSignatureError("permit2TransferFrom");
  }

  if (!isAddressEqual(requirementSignature.args.asset, asset)) {
    throw new DepositAssetMismatchError(asset, requirementSignature.args.asset);
  }

  // Permit2 and ERC-2612 overwrite the previous allowance with the signed amount.
  // It must exactly cover the transfer: less would fail, more would leave residual allowance.
  if (requirementSignature.args.amount !== amount) {
    throw new DepositAmountMismatchError(
      amount,
      requirementSignature.args.amount,
    );
  }

  if (requirementSignature.action.type === "permit2") {
    if (!("expiration" in requirementSignature.args)) {
      throw new Permit2ExpirationMissingError();
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
