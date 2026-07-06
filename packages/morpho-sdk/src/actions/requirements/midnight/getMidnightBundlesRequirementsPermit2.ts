import { type Address, MathLib } from "@morpho-org/blue-sdk";
import type {
  ERC20ApprovalAction,
  Permit2TransferAction,
  Permit2TransferArgs,
  Requirement,
  Transaction,
} from "../../../types/index.js";
import { encodeErc20Permit2Transfer } from "../encode/index.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";

/**
 * Computes the Permit2 prerequisites for MidnightBundles to pull `amount` of `address`.
 *
 * Emits two ordered prerequisites:
 *
 * 1. A classic ERC-20 approval to the Permit2 contract (infinite, if not already in place).
 * 2. A Permit2 SignatureTransfer `Requirement` signed against MidnightBundles.
 *
 * @param params.address - ERC-20 token address.
 * @param params.chainId - The chain the bundle targets.
 * @param params.permit2 - The Permit2 contract address for the chain.
 * @param params.spender - MidnightBundles address that will spend the SignatureTransfer.
 * @param params.args.amount - Required token amount.
 * @param params.erc20Allowances - Current ERC-20 allowances keyed by spender contract name.
 * @param params.nonce - One-shot Permit2 unordered nonce.
 * @returns Ordered list of approval transactions and/or `Requirement` objects to satisfy before bundling.
 * @throws {ApprovalAmountLessThanSpendAmountError} from the inner approval helper when its
 *   bookkeeping invariants break (should not happen with the values this function passes).
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not MidnightBundles for `chainId`.
 * @example
 * ```ts
 * import { getChainAddresses } from "@morpho-org/blue-sdk";
 * import { getMidnightBundlesRequirementsPermit2 } from "@morpho-org/morpho-sdk";
 *
 * const { permit2, midnightBundles } = getChainAddresses(1);
 * if (!permit2 || !midnightBundles) throw new Error("Midnight bundles not configured");
 * const requirements = getMidnightBundlesRequirementsPermit2({
 *   address: USDC,
 *   chainId: 1,
 *   permit2,
 *   spender: midnightBundles,
 *   args: { amount: 1_000_000n },
 *   erc20Allowances: { permit2: 0n },
 *   nonce: 42n,
 * });
 * ```
 */
export const getMidnightBundlesRequirementsPermit2 = (params: {
  readonly address: Address;
  readonly chainId: number;
  readonly permit2: Address;
  readonly spender: Address;
  readonly args: { readonly amount: bigint };
  readonly erc20Allowances: { readonly permit2: bigint };
  readonly nonce: bigint;
}): readonly (
  | Transaction<ERC20ApprovalAction>
  | Requirement<Permit2TransferAction, Permit2TransferArgs>
)[] => {
  const {
    address,
    chainId,
    permit2,
    spender,
    args: { amount },
    erc20Allowances,
    nonce,
  } = params;

  return [
    ...getRequirementsApproval({
      address,
      chainId,
      args: {
        approvalAmount: MathLib.MAX_UINT_160,
        spendAmount: amount,
        spender: permit2,
      },
      allowances: erc20Allowances.permit2,
    }),
    encodeErc20Permit2Transfer({
      token: address,
      spender,
      amount,
      chainId,
      nonce,
    }),
  ];
};
