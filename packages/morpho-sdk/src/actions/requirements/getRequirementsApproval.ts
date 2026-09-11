import type { Address } from "@morpho-org/blue-sdk";
import { isAddressEqual } from "viem";
import { APPROVE_ONLY_ONCE_TOKENS } from "../../helpers/constant.js";
import {
  ApprovalAmountLessThanSpendAmountError,
  type ERC20ApprovalAction,
  type Transaction,
} from "../../types/index.js";
import { encodeErc20Approval } from "./encode/encodeErc20Approval.js";

/**
 * Computes classic ERC-20 approval transactions for a supported SDK spender, given the existing
 * allowance.
 *
 * The spender is validated by {@link encodeErc20Approval}. Supported spenders are the chain's
 * GeneralAdapter1, Permit2, Midnight, MidnightBundles, VaultExitBundlesV1, VaultBundlesV1, and
 * BlueBundlesV1 addresses when configured.
 *
 * Returns an empty array when the allowance already covers `spendAmount`. When the token is in
 * `APPROVE_ONLY_ONCE_TOKENS` (e.g. USDT) and the existing allowance is non-zero, prepends a
 * `approve(spender, 0)` reset transaction to satisfy those tokens' allowance-must-be-zero rule
 * before re-approving.
 *
 * @param params.address - ERC-20 token address.
 * @param params.chainId - The chain the transaction targets, used to resolve supported spenders
 *   and token approval caps.
 * @param params.args.spendAmount - The amount the bundle will actually pull.
 * @param params.args.approvalAmount - The amount to approve (often equal to `spendAmount`, but
 *   may be `maxUint256` for reusable Permit2 or saturated-share-repay approvals).
 * @param params.args.spender - Address that will be granted the approval. Must be GeneralAdapter1,
 *   Permit2, Midnight, MidnightBundles, VaultExitBundlesV1, VaultBundlesV1, or BlueBundlesV1 for
 *   `chainId`.
 * @param params.allowances - The user's current allowance of `address` for `spender`.
 * @returns Up to two deep-frozen `Transaction<ERC20ApprovalAction>` entries: an optional reset
 *   followed by the new approval. Empty when no approval is needed.
 * @throws {ApprovalAmountLessThanSpendAmountError} when `approvalAmount < spendAmount`.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the address registry.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not a supported SDK spender for `chainId`.
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
      APPROVE_ONLY_ONCE_TOKENS[chainId]?.some((token) =>
        isAddressEqual(token, address),
      ) &&
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
