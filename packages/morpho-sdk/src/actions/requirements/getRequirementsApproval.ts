import type { Address } from "@morpho-org/blue-sdk";
import { APPROVE_ONLY_ONCE_TOKENS } from "@morpho-org/simulation-sdk";
import {
  ApprovalAmountLessThanSpendAmountError,
  type ERC20ApprovalAction,
  type Transaction,
} from "../../types/index.js";
import { encodeErc20Approval } from "./encode/encodeErc20Approval.js";

/**
 * Computes classic ERC-20 approval transactions for a spender, given the existing allowance.
 *
 * Returns an empty array when the allowance already covers `spendAmount`. When the token is in
 * `APPROVE_ONLY_ONCE_TOKENS` (e.g. USDT) and the existing allowance is non-zero, prepends a
 * `approve(spender, 0)` reset transaction to satisfy those tokens' allowance-must-be-zero rule
 * before re-approving.
 *
 * @param params.address - ERC-20 token address.
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.spendAmount - The amount the bundle will actually pull.
 * @param params.args.approvalAmount - The amount to approve (often equal to `spendAmount`, but
 *   may be `MAX_UINT_160` for Permit2 prerequisites).
 * @param params.args.spender - Address that will be granted the approval.
 * @param params.allowances - The user's current allowance of `address` for `spender`.
 * @returns Up to two deep-frozen `Transaction<ERC20ApprovalAction>` entries: an optional reset
 *   followed by the new approval. Empty when no approval is needed.
 * @throws {ApprovalAmountLessThanSpendAmountError} when `approvalAmount < spendAmount`.
 * @example
 * ```ts
 * import { getRequirementsApproval } from "@morpho-org/morpho-sdk";
 *
 * const txs = getRequirementsApproval({
 *   address: USDC,
 *   chainId: 1,
 *   args: { approvalAmount: 1_000_000n, spendAmount: 1_000_000n, spender: generalAdapter1 },
 *   allowances: 0n,
 * });
 * // txs satisfies Readonly<Transaction<ERC20ApprovalAction>>[]
 * ```
 */
export const getRequirementsApproval = (params: {
  address: Address;
  chainId: number;
  args: { approvalAmount: bigint; spendAmount: bigint; spender: Address };
  allowances: bigint;
}): Readonly<Transaction<ERC20ApprovalAction>>[] => {
  const {
    address,
    chainId,
    args: { spendAmount, approvalAmount, spender },
    allowances,
  } = params;

  if (approvalAmount < spendAmount) {
    throw new ApprovalAmountLessThanSpendAmountError();
  }

  const approvals: Transaction<ERC20ApprovalAction>[] = [];

  if (allowances < spendAmount) {
    if (
      APPROVE_ONLY_ONCE_TOKENS[chainId]?.includes(address) &&
      allowances > 0n
    ) {
      approvals.push(
        encodeErc20Approval({
          token: address,
          spender,
          amount: 0n,
          chainId,
        }),
      );
    }

    approvals.push(
      encodeErc20Approval({
        token: address,
        spender,
        amount: approvalAmount,
        chainId,
      }),
    );
  }

  return approvals;
};
