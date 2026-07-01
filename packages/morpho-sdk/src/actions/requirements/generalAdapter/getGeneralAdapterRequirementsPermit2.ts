import { type Address, getChainAddresses, MathLib } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import type {
  Bundler3TokenSignatureRequirement,
  ERC20ApprovalAction,
  Transaction,
} from "../../../types/index.js";
import { encodeErc20Permit2Approve } from "../encode/encodeErc20Permit2Approve.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";

interface GeneralAdapterPermit2Allowances {
  readonly generalAdapter1: bigint;
  readonly permit2: bigint;
}

interface GeneralAdapterPermit2Allowance {
  readonly amount: bigint;
  readonly expiration: bigint;
  readonly nonce: bigint;
}

/**
 * Computes the Permit2 prerequisites for `GeneralAdapter1` to pull `amount` of `address`.
 *
 * Returns an empty array when the direct adapter allowance already covers `amount`. Otherwise
 * emits two ordered prerequisites:
 *
 * 1. A classic ERC-20 approval to the Permit2 contract (infinite, if not already in place).
 * 2. A Permit2 `Requirement` signed against `GeneralAdapter1` (skipped when the existing
 *    Permit2-managed allowance covers `amount` and is not about to expire within four hours).
 *
 * @param params.address - ERC-20 token address.
 * @param params.chainId - The chain the bundle targets.
 * @param params.permit2 - The Permit2 contract address for the chain.
 * @param params.args.amount - Required token amount.
 * @param params.allowances - Current ERC-20 allowances keyed by spender contract name.
 * @param params.permit2Allowance - Permit2-managed allowance for `GeneralAdapter1`.
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
 *   allowances: { generalAdapter1: 0n, permit2: 0n },
 *   permit2Allowance: { amount: 0n, expiration: 0n, nonce: 0n },
 * });
 * // requirements satisfies (Readonly<Transaction<ERC20ApprovalAction> | Bundler3TokenSignatureRequirement>)[]
 * ```
 */
export const getGeneralAdapterRequirementsPermit2 = (params: {
  address: Address;
  chainId: number;
  permit2: Address;
  args: { amount: bigint };
  allowances: GeneralAdapterPermit2Allowances;
  permit2Allowance: GeneralAdapterPermit2Allowance;
}): Readonly<
  Transaction<ERC20ApprovalAction> | Bundler3TokenSignatureRequirement
>[] => {
  const {
    address,
    chainId,
    permit2,
    args: { amount },
    allowances,
    permit2Allowance,
  } = params;

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  if (allowances.generalAdapter1 >= amount) {
    return [];
  }

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
    allowances: allowances.permit2,
  });

  requirements.push(...approvalRequirements);

  if (
    permit2Allowance.amount < amount ||
    permit2Allowance.expiration < Time.timestamp() + Time.s.from.h(4n)
  ) {
    requirements.push(
      encodeErc20Permit2Approve({
        token: address,
        spender: generalAdapter1,
        amount,
        chainId,
        nonce: permit2Allowance.nonce,
        expiration: MathLib.MAX_UINT_48, // Always approve indefinitely.
      }),
    );
  }

  return requirements;
};
