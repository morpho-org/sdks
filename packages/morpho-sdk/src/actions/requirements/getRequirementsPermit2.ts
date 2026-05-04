import { type Address, MathLib } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import type {
  ERC20ApprovalAction,
  Requirement,
  Transaction,
} from "../../types/index.js";
import { encodeErc20Permit2 } from "./encode/encodeErc20Permit2.js";
import { getRequirementsApproval } from "./getRequirementsApproval.js";

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
 * @param params.allowancesPermit2 - The user's current allowance of `address` for the Permit2
 *   contract.
 * @param params.allowancesGeneralAdapter - The user's current direct allowance of `address` for
 *   `GeneralAdapter1` (separate from the Permit2-managed allowance).
 * @param params.allowanceGeneralAdapterPermit2 - The Permit2-managed allowance for
 *   `GeneralAdapter1` to spend `address`.
 * @param params.allowanceGeneralAdapterExpiration - Expiration timestamp of the Permit2-managed
 *   allowance.
 * @param params.nonce - The user's current Permit2 nonce for `(address, GeneralAdapter1)`.
 * @returns Ordered list of approval transactions and/or `Requirement` objects to satisfy before
 *   bundling.
 * @throws {ApprovalAmountLessThanSpendAmountError} from the inner approval helper when its
 *   bookkeeping invariants break (should not happen with the values this function passes).
 * @example
 * ```ts
 * import { getRequirementsPermit2 } from "@morpho-org/morpho-sdk";
 *
 * const requirements = getRequirementsPermit2({
 *   address: USDC,
 *   chainId: 1,
 *   permit2: PERMIT2_ADDRESS,
 *   args: { amount: 1_000_000n },
 *   allowancesPermit2: 0n,
 *   allowancesGeneralAdapter: 0n,
 *   allowanceGeneralAdapterPermit2: 0n,
 *   allowanceGeneralAdapterExpiration: 0n,
 *   nonce: 0n,
 * });
 * // requirements satisfies (Readonly<Transaction<ERC20ApprovalAction> | Requirement>)[]
 * ```
 */
export const getRequirementsPermit2 = (params: {
  address: Address;
  chainId: number;
  permit2: Address;
  args: { amount: bigint };
  allowancesPermit2: bigint;
  allowancesGeneralAdapter: bigint;
  allowanceGeneralAdapterPermit2: bigint;
  allowanceGeneralAdapterExpiration: bigint;
  nonce: bigint;
}): Readonly<Transaction<ERC20ApprovalAction> | Requirement>[] => {
  const {
    address,
    chainId,
    permit2,
    args: { amount },
    allowancesPermit2,
    allowancesGeneralAdapter,
    allowanceGeneralAdapterPermit2,
    allowanceGeneralAdapterExpiration,
    nonce,
  } = params;

  if (allowancesGeneralAdapter >= amount) {
    return [];
  }

  const requirements: (Transaction<ERC20ApprovalAction> | Requirement)[] = [];

  const approvalRequirements = getRequirementsApproval({
    address,
    chainId,
    args: {
      approvalAmount: MathLib.MAX_UINT_160, // Always approve infinite.
      spendAmount: amount,
      spender: permit2,
    },
    allowances: allowancesPermit2,
  });

  requirements.push(...approvalRequirements);

  if (
    allowanceGeneralAdapterPermit2 < amount ||
    allowanceGeneralAdapterExpiration < Time.timestamp() + Time.s.from.h(4n)
  ) {
    requirements.push(
      encodeErc20Permit2({
        token: address,
        amount,
        chainId,
        nonce,
        expiration: MathLib.MAX_UINT_48, // Always approve indefinitely.
      }),
    );
  }

  return requirements;
};
