import { type Address, MathLib } from "@morpho-org/blue-sdk";
import type {
  Bundler3TokenSignatureRequirement,
  ERC20ApprovalAction,
  Transaction,
} from "../../../types/index.js";
import { encodeErc20Permit2Approve } from "../encode/encodeErc20Permit2Approve.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";

interface GeneralAdapterPermit2Erc20Allowances {
  readonly permit2: bigint;
}

/**
 * Computes the Permit2 prerequisites for `GeneralAdapter1` to pull `amount` of `address`.
 *
 * Emits two ordered prerequisites:
 *
 * 1. A classic ERC-20 approval to the Permit2 contract (infinite, if not already in place).
 * 2. A Permit2 `Requirement` signed against `GeneralAdapter1`.
 *
 * The Permit2 signature is always requested for the exact transfer amount when this path is
 * selected. Permit2 allowance signatures overwrite the existing allowance, so relying on
 * residual Permit2-managed allowance would make the final transfer path depend on stale state and
 * could leave allowance behind after a partial spend.
 *
 * @param params.address - ERC-20 token address.
 * @param params.chainId - The chain the bundle targets.
 * @param params.permit2 - The Permit2 contract address for the chain.
 * @param params.args.amount - Required token amount.
 * @param params.erc20Allowances - Current ERC-20 allowances keyed by spender contract name.
 * @param params.permit2Nonce - Current Permit2 nonce for the token owner / token / GeneralAdapter1 tuple.
 * @returns Ordered list of approval transactions and/or `Requirement` objects to satisfy before
 *   bundling.
 * @throws {ApprovalAmountLessThanSpendAmountError} from the inner approval helper when its
 *   bookkeeping invariants break (should not happen with the values this function passes).
 * @example
 * ```ts
 * import { getChainAddresses } from "@morpho-org/blue-sdk";
 * import { getGeneralAdapterRequirementsPermit2 } from "@morpho-org/morpho-sdk";
 *
 * const { permit2 } = getChainAddresses(1);
 * if (!permit2) throw new Error("Permit2 not configured for this chain");
 * const requirements = getGeneralAdapterRequirementsPermit2({
 *   address: USDC,
 *   chainId: 1,
 *   permit2,
 *   args: { amount: 1_000_000n },
 *   erc20Allowances: { permit2: 0n },
 *   permit2Nonce: 0n,
 * });
 * // requirements satisfies (Readonly<Transaction<ERC20ApprovalAction> | Bundler3TokenSignatureRequirement>)[]
 * ```
 */
export const getGeneralAdapterRequirementsPermit2 = (params: {
  address: Address;
  chainId: number;
  permit2: Address;
  args: { amount: bigint };
  erc20Allowances: GeneralAdapterPermit2Erc20Allowances;
  permit2Nonce: bigint;
}): Readonly<
  Transaction<ERC20ApprovalAction> | Bundler3TokenSignatureRequirement
>[] => {
  const {
    address,
    chainId,
    permit2,
    args: { amount },
    erc20Allowances,
    permit2Nonce,
  } = params;

  const requirements: (
    | Transaction<ERC20ApprovalAction>
    | Bundler3TokenSignatureRequirement
  )[] = [];

  const approvalRequirements = getRequirementsApproval({
    address,
    chainId,
    args: {
      approvalAmount: MathLib.MAX_UINT_160, // Always approve infinite.
      spendAmount: amount,
      spender: permit2,
    },
    allowances: erc20Allowances.permit2,
  });

  requirements.push(...approvalRequirements);

  // Existing Permit2-managed allowance is intentionally not checked for sufficiency. Permit2
  // overwrites the allowance with this signed amount, and the bundle spends exactly `amount`,
  // leaving no residual Permit2 allowance after inclusion.
  requirements.push(
    encodeErc20Permit2Approve({
      token: address,
      amount,
      chainId,
      nonce: permit2Nonce,
      expiration: MathLib.MAX_UINT_48, // Always approve indefinitely.
    }),
  );

  return requirements;
};
