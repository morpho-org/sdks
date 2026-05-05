import { type Address, MathLib } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { MAX_TOKEN_APPROVALS } from "@morpho-org/simulation-sdk";
import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import type { ERC20ApprovalAction, Transaction } from "../../../types/index.js";

/** Parameters for {@link encodeErc20Approval}. */
interface EncodeErc20ApprovalParams {
  token: Address;
  spender: Address;
  amount: bigint;
  chainId: number;
}

/**
 * Encodes a deep-frozen ERC-20 `approve(spender, amount)` transaction.
 *
 * Caps `amount` at the per-chain, per-token maximum from `MAX_TOKEN_APPROVALS` (defaults to
 * `maxUint256`). Used by {@link getRequirementsApproval} and {@link getRequirementsPermit2}.
 *
 * @param params - Encoding parameters.
 * @param params.token - ERC-20 token address to approve.
 * @param params.spender - Address granted the allowance.
 * @param params.amount - Allowance amount before per-token cap.
 * @param params.chainId - The chain the transaction targets (used to resolve the per-token cap).
 * @returns A deep-frozen `Transaction<ERC20ApprovalAction>` with the capped approval amount.
 * @example
 * ```ts
 * import { encodeErc20Approval } from "@morpho-org/morpho-sdk";
 *
 * const tx = encodeErc20Approval({
 *   token: USDC,
 *   spender: generalAdapter1,
 *   amount: 1_000_000n,
 *   chainId: 1,
 * });
 * // tx satisfies Readonly<Transaction<ERC20ApprovalAction>>
 * ```
 */
export const encodeErc20Approval = (
  params: EncodeErc20ApprovalParams,
): Transaction<ERC20ApprovalAction> => {
  const { token, spender, amount, chainId } = params;

  const amountValue = MathLib.min(
    amount,
    MAX_TOKEN_APPROVALS[chainId]?.[token] ?? maxUint256,
  );

  return deepFreeze({
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amountValue],
    }),
    value: 0n,
    action: {
      type: "erc20Approval" as const,
      args: { spender: spender, amount: amountValue },
    },
  });
};
