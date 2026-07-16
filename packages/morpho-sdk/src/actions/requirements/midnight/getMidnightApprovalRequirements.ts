import type { Address, Client } from "viem";
import { erc20Abi } from "viem";
import { readContract } from "viem/actions";
import {
  validateChainId,
  validateRequirementSpender,
} from "../../../helpers/index.js";
import {
  type ERC20ApprovalAction,
  NegativeMidnightAmountError,
  type Transaction,
} from "../../../types/index.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";

/** Parameters for {@link getMidnightApprovalRequirements}. */
export interface GetMidnightApprovalRequirementsParams {
  readonly viemClient: Client;
  readonly chainId: number;
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
  readonly amount: bigint;
}

/**
 * Resolves classic ERC20 approval requirements for a Midnight spender.
 *
 * Entity flows call this while preparing a transaction plan. Direct low-level consumers
 * should call it before encoding a Midnight action that lets `Midnight` or
 * `MidnightBundles` pull ERC20 tokens from the user.
 *
 * @param params.viemClient - Viem client used to read ERC20 allowance.
 * @param params.chainId - Chain id expected by the viem client.
 * @param params.token - ERC20 token that may need approval.
 * @param params.owner - Token owner.
 * @param params.spender - Midnight spender that will pull tokens.
 * @param params.amount - Token amount the spender must be able to pull.
 * @returns Approval transactions required for `spender` to pull `amount`.
 * @throws {ChainIdMismatchError} when the viem client is connected to another chain.
 * @throws {NegativeMidnightAmountError} when `amount` is negative.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not the chain's Midnight or MidnightBundles deployment.
 * @example
 * ```ts
 * import {
 *   getMidnightApprovalRequirements,
 *   midnightTakeLend,
 * } from "@morpho-org/morpho-sdk";
 *
 * const approvals = await getMidnightApprovalRequirements({
 *   viemClient: client,
 *   chainId: 8453,
 *   token: loanToken,
 *   owner: user,
 *   spender: midnightBundles,
 *   amount: 1_000_000n,
 * });
 * if (approvals.length === 0) {
 *   const tx = midnightTakeLend(takeParams);
 * }
 * ```
 */
export const getMidnightApprovalRequirements = async (
  params: GetMidnightApprovalRequirementsParams,
): Promise<readonly Readonly<Transaction<ERC20ApprovalAction>>[]> => {
  validateChainId(params.viemClient.chain?.id, params.chainId);
  if (params.amount < 0n) {
    throw new NegativeMidnightAmountError("approval amount", params.amount);
  }
  // Validate the target even when no approval transaction needs to be encoded.
  validateRequirementSpender({
    chainId: params.chainId,
    spender: params.spender,
    allowed: ["midnight", "midnightBundles"],
  });

  if (params.amount === 0n) return [];

  const allowance = await readContract(params.viemClient, {
    address: params.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.owner, params.spender],
  });

  return getRequirementsApproval({
    address: params.token,
    chainId: params.chainId,
    args: {
      spender: params.spender,
      spendAmount: params.amount,
      approvalAmount: params.amount,
    },
    allowances: allowance,
  });
};
