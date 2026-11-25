import { type Address, MathLib } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import { capTokenApproval } from "../../../helpers/tokenApproval.js";
import { validateRequirementSpender } from "../../../helpers/validateRequirementSpender.js";
import type { ERC20ApprovalAction, Transaction } from "../../../types/index.js";

/** Parameters for {@link encodeErc20Approval}. */
interface EncodeErc20ApprovalParams {
  token: Address;
  spender: Address;
  amount: bigint;
  chainId: number;
}

declare const erc20ApprovalInput: unique symbol;
/** Complete checked approval and its token-specific cap. @internal */
export type Erc20ApprovalInput = Readonly<EncodeErc20ApprovalParams> & {
  readonly maxApproval: bigint;
  readonly [erc20ApprovalInput]: true;
};

/** Checks the complete standalone approval before encoding. @internal */
export const parseErc20Approval = (
  params: EncodeErc20ApprovalParams,
): Erc20ApprovalInput => {
  const input = {
    token: params.token,
    spender: params.spender,
    amount: params.amount,
    chainId: params.chainId,
  };
  validateRequirementSpender({
    chainId: input.chainId,
    spender: input.spender,
    allowed: [
      "permit2",
      "midnight",
      "midnightBundlesV2",
      "vaultExitBundlesV1",
      "vaultBundlesV1",
      "blueBundlesV1",
    ],
  });
  return {
    ...input,
    maxApproval: capTokenApproval({ ...input, amount: maxUint256 }),
  } as Erc20ApprovalInput;
};

/**
 * Encodes a deep-frozen ERC-20 approval transaction for a supported SDK spender.
 *
 * Caps `amount` at the per-chain, per-token maximum from `MAX_TOKEN_APPROVALS` (defaults to
 * `maxUint256`). Used by {@link getRequirementsApproval}.
 *
 * @param params - Encoding parameters.
 * @param params.token - ERC-20 token address to approve.
 * @param params.spender - Address granted the allowance. Must be Permit2, Midnight,
 *   MidnightBundlesV2, VaultExitBundlesV1, VaultBundlesV1, or BlueBundlesV1 for
 *   the chain.
 * @param params.amount - Allowance amount before per-token cap.
 * @param params.chainId - The chain the transaction targets (used to resolve supported spenders and the per-token cap).
 * @returns A deep-frozen `Transaction<ERC20ApprovalAction>` with the capped approval amount.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the address registry.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not a supported SDK spender for `chainId`.
 * @example
 * ```ts
 * import { encodeErc20Approval } from "@morpho-org/morpho-sdk";
 *
 * const tx = encodeErc20Approval({
 *   token: USDC,
 *   spender: blueBundlesV1,
 *   amount: 1_000_000n,
 *   chainId: 1,
 * });
 * // tx satisfies Readonly<Transaction<ERC20ApprovalAction>>
 * ```
 */
export const encodeErc20Approval = (
  params: EncodeErc20ApprovalParams,
): Transaction<ERC20ApprovalAction> => {
  return encodeParsedErc20Approval(parseErc20Approval(params));
};

/** Encodes the complete checked approval without repeating static checks. @internal */
export const encodeParsedErc20Approval = (
  params: Erc20ApprovalInput,
): Transaction<ERC20ApprovalAction> => {
  const { token, spender, amount, maxApproval } = params;
  const amountValue = MathLib.min(amount, maxApproval);

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
      args: { spender, amount: amountValue },
    },
  });
};
