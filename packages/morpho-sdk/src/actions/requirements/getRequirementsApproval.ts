import type { Address } from "@morpho-org/blue-sdk";
import { getTokenApprovalAmounts } from "../../helpers/tokenApproval.js";
import type { ERC20ApprovalAction, Transaction } from "../../types/index.js";
import {
  type Erc20ApprovalInput,
  encodeParsedErc20Approval,
  parseErc20Approval,
} from "./encode/encodeErc20Approval.js";

/** Complete raw approval requirement invocation. @internal */
interface RequirementsApprovalParams {
  address: Address;
  chainId: number;
  args: { spendAmount: bigint; spender: Address };
  allowances: bigint;
}
const requirementsApprovalInput: unique symbol = Symbol(
  "RequirementsApprovalInput",
);
/** Complete checked approval requirements, including ordered reset and approval inputs. @internal */
export interface RequirementsApprovalInput
  extends Readonly<RequirementsApprovalParams> {
  readonly args: Readonly<RequirementsApprovalParams["args"]>;
  readonly approvals: readonly Erc20ApprovalInput[];
  readonly [requirementsApprovalInput]: true;
}

/** Owns no-op and token/spender error precedence for direct callers. @internal */
export const parseRequirementsApproval = (
  params: RequirementsApprovalParams,
): RequirementsApprovalInput => {
  const args = params.args;
  const input = {
    address: params.address,
    chainId: params.chainId,
    args: {
      spendAmount: args.spendAmount,
      spender: args.spender,
    },
    allowances: params.allowances,
  };
  const amounts = getTokenApprovalAmounts({
    token: input.address,
    chainId: input.chainId,
    allowance: input.allowances,
    spendAmount: input.args.spendAmount,
  });
  const approvals = amounts.map((amount) =>
    parseErc20Approval({
      token: input.address,
      spender: input.args.spender,
      chainId: input.chainId,
      amount,
    }),
  );
  return {
    ...input,
    args: { ...input.args },
    approvals,
    [requirementsApprovalInput]: true,
  };
};

/**
 * Computes classic ERC-20 approval transactions for a supported SDK spender, given the existing
 * allowance.
 *
 * The operation constructor validates the spender before constructing approval inputs. Supported
 * spenders are the chain's Permit2, Midnight, MidnightBundlesV2, VaultExitBundlesV1, VaultBundlesV1, and BlueBundlesV1
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
export const getRequirementsApproval = (
  params: RequirementsApprovalParams,
): Readonly<Transaction<ERC20ApprovalAction>>[] =>
  getParsedRequirementsApproval(parseRequirementsApproval(params));

/** Consumes all checked approval inputs without revalidating each transaction. @internal */
export const getParsedRequirementsApproval = (
  params: RequirementsApprovalInput,
): Readonly<Transaction<ERC20ApprovalAction>>[] =>
  params.approvals.map(encodeParsedErc20Approval);
