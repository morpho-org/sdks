import type { Address } from "viem";
import {
  ApprovalAmountLessThanSpendAmountError,
  type ERC20ApprovalAction,
  NegativeInputError,
  type Transaction,
} from "../../types/index.js";
import { getRequirementsApproval } from "../requirements/getRequirementsApproval.js";

/** Parameters for resolving classic ERC-20 approval requirements for a bundles token pull. */
export interface ResolveBundlesApprovalRequirementsParams {
  /** ERC-20 token pulled by the bundles contract. */
  readonly token: Address;
  /** Registered bundles contract approved to pull the token. */
  readonly spender: Address;
  /** Target chain id. */
  readonly chainId: number;
  /** Exact amount the bundles contract will pull. */
  readonly amount: bigint;
  /** Current token allowance granted to `spender`. */
  readonly allowance: bigint;
  /** Amount to approve when the current allowance is insufficient. */
  readonly approvalAmount: bigint;
}

/**
 * Resolves pre-fetched allowance state into classic ERC-20 approval requirements.
 *
 * @param params - Approval parameters and current allowance state.
 * @returns Ordered approval transactions, or an empty array when the allowance is sufficient.
 * @throws {NegativeInputError} when `amount` is negative.
 * @throws {ApprovalAmountLessThanSpendAmountError} when `approvalAmount` is below `amount`.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the address registry.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not registered for `chainId`.
 * @example
 * ```ts
 * const requirements = resolveBundlesApprovalRequirements({
 *   token,
 *   spender,
 *   chainId: 1,
 *   amount: 1_000_000n,
 *   allowance: 0n,
 *   approvalAmount: 1_000_000n,
 * });
 * // requirements contains an approval for 1_000_000 tokens.
 * ```
 * @internal
 */
export const resolveBundlesApprovalRequirements = (
  params: ResolveBundlesApprovalRequirementsParams,
): readonly Readonly<Transaction<ERC20ApprovalAction>>[] => {
  if (params.amount < 0n) {
    throw new NegativeInputError("amount", params.amount);
  }
  if (params.amount === 0n) return [];
  if (params.approvalAmount < params.amount) {
    throw new ApprovalAmountLessThanSpendAmountError();
  }

  return getRequirementsApproval({
    address: params.token,
    chainId: params.chainId,
    args: {
      spender: params.spender,
      spendAmount: params.approvalAmount,
      approvalAmount: params.approvalAmount,
    },
    allowances: params.allowance,
  });
};
