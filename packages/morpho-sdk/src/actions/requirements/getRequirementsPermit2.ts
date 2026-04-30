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
 * Get token "requirement" for permit2.
 *
 * Two steps:
 * 1. Verify if the allowance is enough on permit2 contract.
 * => If not, approve the token to permit2 contract with classic approval on infinite amount.
 * 2. Verify if the allowance is enough on general adapter from permit2 contract.
 * => If not, approve the token to general adapter from permit2 contract with permit2 signature on the required amount.
 *
 * @param params - Destructured object with:
 * @param params.address - ERC20 token address.
 * @param params.chainId - Chain/network id.
 * @param params.permit2 - Permit2 contract address.
 * @param params.args - Object with:
 * @param params.args.amount - Required token amount.
 * @param params.allowancesGeneralAdapter - Allowance for general adapter from permit2 contract.
 * @param params.allowancesPermit2 - Allowance for permit2.
 * @param params.allowanceGeneralAdapterPermit2 - Allowance for general adapter from permit2 contract.
 * @param params.allowanceGeneralAdapterExpiration - Expiration for general adapter from permit2 contract.
 * @param params.nonce - Nonce for permit2.
 * @returns An array of approval transaction or requirement signatures objects.
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
