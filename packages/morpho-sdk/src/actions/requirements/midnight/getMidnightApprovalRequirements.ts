import type { Address, Client } from "viem";
import { erc20Abi } from "viem";
import { readContract } from "viem/actions";
import { validateChainId } from "../../../helpers/index.js";
import type { ERC20ApprovalAction, Transaction } from "../../../types/index.js";
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
 * @param params - Approval resolution parameters.
 * @returns Approval transactions required for `spender` to pull `amount`.
 * @throws {ChainIdMismatchError} when the viem client is connected to another chain.
 * @example
 * ```ts
 * import { getMidnightApprovalRequirements } from "@morpho-org/morpho-sdk";
 *
 * const approvals = await getMidnightApprovalRequirements({
 *   viemClient: client,
 *   chainId: 8453,
 *   token: loanToken,
 *   owner: user,
 *   spender: midnightBundles,
 *   amount: 1_000_000n,
 * });
 * console.log(approvals.length);
 * ```
 */
export const getMidnightApprovalRequirements = async (
  params: GetMidnightApprovalRequirementsParams,
): Promise<readonly Readonly<Transaction<ERC20ApprovalAction>>[]> => {
  validateChainId(params.viemClient.chain?.id, params.chainId);

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
