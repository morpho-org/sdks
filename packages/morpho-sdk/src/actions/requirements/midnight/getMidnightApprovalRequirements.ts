import type { Address, Client } from "viem";
import { erc20Abi, maxUint256 } from "viem";
import { readContract } from "viem/actions";
import {
  validateChainId,
  validateRequirementSpender,
} from "../../../helpers/index.js";
import { validateUint256Field } from "../../../helpers/validate.js";
import type { ERC20ApprovalAction, Transaction } from "../../../types/index.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";
import { validateClientChainId } from "../validateClientChainId.js";

/** Parameters for {@link getMidnightApprovalRequirements}. */
export interface GetMidnightApprovalRequirementsParams {
  readonly viemClient: Client;
  readonly chainId: number;
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
  readonly amount: bigint;
  /**
   * Allowance to set when an approval is needed. Defaults to `maxUint256`; must be
   * at least `amount`.
   */
  readonly approvalAmount?: bigint;
}

/**
 * Resolves classic ERC20 approval requirements for a Midnight spender.
 *
 * Entity flows call this from `getRequirements()`. Direct low-level consumers
 * should pass the spender used by the action: `Midnight` for direct calls, or
 * `MidnightBundlesV2` for bundle flows, including `repayWithdrawCollateral`.
 *
 * The returned approval sets an unlimited allowance (`maxUint256`, capped per
 * token by `MAX_TOKEN_APPROVALS`) whenever the current allowance is below
 * `amount`, because all of an account's Midnight offers and bundle calls share
 * one allowance per token. Pass `approvalAmount` to set a different allowance.
 *
 * @param params.viemClient - Viem client used to read ERC20 allowance.
 * @param params.chainId - Chain id expected by the viem client.
 * @param params.token - ERC20 token that may need approval.
 * @param params.owner - Token owner.
 * @param params.spender - Midnight spender that will pull tokens.
 * @param params.amount - Minimum allowance the spender needs.
 * @param params.approvalAmount - Allowance to approve when one is needed; defaults to `maxUint256` and must be at least `amount`.
 * @returns Approval transactions required for `spender` to pull `amount`.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId`,
 *   another chain than `params.chainId`.
 * @throws {viem.BaseError} when the `eth_chainId` request or allowance read fails.
 * @throws {NegativeInputError} when `amount` or `approvalAmount` is negative.
 * @throws {InputExceedsMaxError} when `amount` or `approvalAmount` exceeds `maxUint256`.
 * @throws {ApprovalAmountLessThanSpendAmountError} when `approvalAmount < amount`.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not the chain's Midnight or MidnightBundlesV2 deployment.
 * @example
 * ```ts
 * import { getChainAddress } from "@morpho-org/morpho-sdk/addresses";
 * import {
 *   getMidnightApprovalRequirements,
 *   midnightTakeLend,
 * } from "@morpho-org/morpho-sdk";
 *
 * const chainId = 8453;
 * const midnightBundlesV2 = getChainAddress(chainId, "midnightBundlesV2");
 * const approvals = await getMidnightApprovalRequirements({
 *   viemClient: client,
 *   chainId,
 *   token: loanToken,
 *   owner: user,
 *   spender: midnightBundlesV2,
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
  validateUint256Field("amount", params.amount);
  if (params.approvalAmount !== undefined)
    validateUint256Field("approvalAmount", params.approvalAmount);
  // Validate the target even when no approval transaction needs to be encoded.
  validateRequirementSpender({
    chainId: params.chainId,
    spender: params.spender,
    allowed: ["midnight", "midnightBundlesV2"],
  });
  if (params.amount === 0n) return [];
  await validateClientChainId(params.viemClient, params.chainId);

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
      approvalAmount: params.approvalAmount ?? maxUint256,
    },
    allowances: allowance,
  });
};
