import type { Address } from "viem";
import { maxUint256 } from "viem";
import {
  ApprovalAmountLessThanSpendAmountError,
  type BlueBundlesV1TokenSignatureRequirement,
  type ERC20ApprovalAction,
  InputExceedsMaxError,
  NegativeInputError,
  Permit2TransferFromNonceAlreadyUsedError,
  type Transaction,
} from "../../types/index.js";
import { encodeErc20Permit2TransferFrom } from "../requirements/encode/index.js";
import { getRequirementsApproval } from "../requirements/getRequirementsApproval.js";

/** Plain onchain state used by {@link resolveBundlesTokenRequirements}. */
export type BundlesTokenRequirementsState =
  | {
      readonly type: "approval";
      readonly allowance: bigint;
      readonly approvalAmount: bigint;
    }
  | {
      readonly type: "permit2TransferFrom";
      readonly permit2: Address;
      readonly permit2Allowance: bigint;
      readonly permit2Nonce: bigint;
      readonly nonceBitmap: bigint;
    };

/**
 * Resolves pre-fetched allowance and Permit2 nonce state into ordered bundles requirements.
 *
 * The SignatureTransfer branch always places any ERC-20 approval to canonical Permit2 before the
 * one-time signature requirement.
 *
 * @param params - Funding values, expected bundles spender, and pre-fetched state.
 * @returns Ordered approval transactions and/or a Permit2 SignatureTransfer requirement.
 * @throws {NegativeInputError} when an amount or Permit2 nonce is negative.
 * @throws {InputExceedsMaxError} when the Permit2 nonce exceeds uint256.
 * @throws {Permit2TransferFromNonceAlreadyUsedError} when the selected nonce bit is set.
 * @throws {ApprovalAmountLessThanSpendAmountError} when a classic approval cannot cover the pull.
 * @example
 * ```ts
 * import { resolveBundlesTokenRequirements } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 *
 * const requirements = resolveBundlesTokenRequirements({
 *   token: zeroAddress,
 *   spender: zeroAddress,
 *   owner: zeroAddress,
 *   chainId: 1,
 *   amount: 1_000_000n,
 *   deadline: 1_900_000_000n,
 *   state: { type: "approval", allowance: 1_000_000n, approvalAmount: 1_000_000n },
 * });
 * // requirements is empty because the allowance already covers the amount.
 * ```
 */
export const resolveBundlesTokenRequirements = (params: {
  readonly token: Address;
  readonly spender: Address;
  readonly owner: Address;
  readonly chainId: number;
  readonly amount: bigint;
  readonly deadline: bigint;
  readonly state: BundlesTokenRequirementsState;
}): readonly (
  | Readonly<Transaction<ERC20ApprovalAction>>
  | BlueBundlesV1TokenSignatureRequirement
)[] => {
  if (params.amount < 0n) {
    throw new NegativeInputError("amount", params.amount);
  }
  if (params.amount === 0n) return [];

  if (params.state.type === "approval") {
    if (params.state.approvalAmount < params.amount) {
      throw new ApprovalAmountLessThanSpendAmountError();
    }
    return getRequirementsApproval({
      address: params.token,
      chainId: params.chainId,
      args: {
        spender: params.spender,
        spendAmount: params.state.approvalAmount,
        approvalAmount: params.state.approvalAmount,
      },
      allowances: params.state.allowance,
    });
  }

  if (params.state.permit2Nonce < 0n) {
    throw new NegativeInputError("permit2Nonce", params.state.permit2Nonce);
  }
  if (params.state.permit2Nonce > maxUint256) {
    throw new InputExceedsMaxError({
      field: "permit2Nonce",
      value: params.state.permit2Nonce,
      max: maxUint256,
    });
  }
  const bitPosition = params.state.permit2Nonce & 255n;
  if ((params.state.nonceBitmap & (1n << bitPosition)) !== 0n) {
    throw new Permit2TransferFromNonceAlreadyUsedError(
      params.owner,
      params.state.permit2Nonce,
    );
  }
  return [
    ...getRequirementsApproval({
      address: params.token,
      chainId: params.chainId,
      args: {
        spender: params.state.permit2,
        spendAmount: params.amount,
        approvalAmount: maxUint256,
      },
      allowances: params.state.permit2Allowance,
    }),
    encodeErc20Permit2TransferFrom({
      token: params.token,
      spender: params.spender,
      amount: params.amount,
      chainId: params.chainId,
      nonce: params.state.permit2Nonce,
      deadline: params.deadline,
    }),
  ];
};
