import type { Address } from "@morpho-org/blue-sdk";
import { isAddressEqual, maxUint256 } from "viem";
import { APPROVE_ONLY_ONCE_TOKENS } from "../../helpers/constant.js";
import type { ERC20ApprovalAction, Transaction } from "../../types/index.js";
import { encodeErc20Approval } from "./encode/encodeErc20Approval.js";

/**
 * Computes classic ERC-20 approval transactions for a supported SDK spender, given the existing
 * allowance.
 *
 * The spender is validated by {@link encodeErc20Approval}. Supported spenders are the chain's
 * Permit2, Midnight, MidnightBundlesV2, VaultExitBundlesV1, VaultBundlesV1, and BlueBundlesV1
 * addresses when configured.
 *
 * When `allowances < spendAmount`, requests an approval for `maxUint256`, capped per token by
 * `MAX_TOKEN_APPROVALS`. For tokens in `APPROVE_ONLY_ONCE_TOKENS` (e.g. USDT) with a non-zero
 * allowance, prepends an `approve(spender, 0)` reset before re-approving. No approval is emitted
 * when `allowances >= spendAmount`.
 *
 * @param params.address - ERC-20 token address.
 * @param params.chainId - The chain the transaction targets, used to resolve supported spenders
 *   and token approval caps.
 * @param params.args.spendAmount - The amount the bundle will actually pull.
 * @param params.args.spender - Address that will be granted the approval. Must be Permit2,
 *   Midnight, MidnightBundlesV2, VaultExitBundlesV1, VaultBundlesV1, or BlueBundlesV1 for `chainId`.
 * @param params.allowances - The user's current allowance of `address` for `spender`.
 * @returns Up to two deep-frozen `Transaction<ERC20ApprovalAction>` entries: an optional reset
 *   followed by the new approval. Empty when `allowances >= spendAmount`.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the address registry.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not a supported SDK spender for `chainId`.
 * @example
 * ```ts
 * import { getRequirementsApproval } from "@morpho-org/morpho-sdk";
 *
 * const txs = getRequirementsApproval({
 *   address: USDC,
 *   chainId: 1,
 *   args: { spendAmount: 1_000_000n, spender: blueBundlesV1 },
 *   allowances: 0n,
 * });
 * // txs satisfies Readonly<Transaction<ERC20ApprovalAction>>[]
 * ```
 */
export const getRequirementsApproval = (params: {
  address: Address;
  chainId: number;
  args: { spendAmount: bigint; spender: Address };
  allowances: bigint;
}): Readonly<Transaction<ERC20ApprovalAction>>[] => {
  const {
    address,
    chainId,
    args: { spendAmount, spender },
    allowances,
  } = params;

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
        amount: maxUint256,
        chainId,
      }),
    );
  }

  return approvals;
};
