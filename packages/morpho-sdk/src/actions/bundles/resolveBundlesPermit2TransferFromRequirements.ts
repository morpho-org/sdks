import type { Address } from "viem";
import { maxUint256 } from "viem";
import {
  type BlueBundlesV1TokenSignatureRequirement,
  type ERC20ApprovalAction,
  InputExceedsMaxError,
  NegativeInputError,
  NonPositiveInputError,
  Permit2TransferFromNonceAlreadyUsedError,
  type Transaction,
} from "../../types/index.js";
import { encodeErc20Permit2TransferFrom } from "../requirements/encode/index.js";
import { getRequirementsApproval } from "../requirements/getRequirementsApproval.js";

/** Parameters for resolving Permit2 SignatureTransfer requirements for a bundles token pull. */
export interface ResolveBundlesPermit2TransferFromRequirementsParams {
  /** ERC-20 token pulled through Permit2. */
  readonly token: Address;
  /** Registered bundles contract named as spender by the signature. */
  readonly spender: Address;
  /** Account funding the bundles operation. */
  readonly owner: Address;
  /** Target chain id. */
  readonly chainId: number;
  /** Exact amount authorized by the signature. */
  readonly amount: bigint;
  /** Signature expiration timestamp in seconds. */
  readonly deadline: bigint;
  /** Canonical Permit2 contract approved to pull the token. */
  readonly permit2: Address;
  /** Current token allowance granted to Permit2. */
  readonly allowance: bigint;
  /** Caller-selected Permit2 unordered nonce. */
  readonly nonce: bigint;
  /** Permit2 nonce-bitmap word containing `nonce`. */
  readonly nonceBitmap: bigint;
}

/**
 * Resolves pre-fetched Permit2 allowance and nonce state into SignatureTransfer requirements.
 *
 * Any required ERC-20 approval to canonical Permit2 precedes the one-time signature requirement.
 *
 * @param params - SignatureTransfer parameters and current Permit2 state.
 * @returns Ordered approval transactions followed by a Permit2 SignatureTransfer requirement.
 * @throws {NegativeInputError} when `amount` or `permit2Nonce` is negative.
 * @throws {NonPositiveInputError} when `deadline` is not positive.
 * @throws {InputExceedsMaxError} when `amount`, `deadline`, or `permit2Nonce` exceeds uint256.
 * @throws {Permit2TransferFromNonceAlreadyUsedError} when the selected nonce bit is set.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the address registry.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `permit2` or `spender` is not registered for
 *   `chainId`.
 * @example
 * ```ts
 * const requirements = resolveBundlesPermit2TransferFromRequirements({
 *   token,
 *   spender,
 *   owner,
 *   chainId: 1,
 *   amount: 1_000_000n,
 *   deadline: 1_900_000_000n,
 *   permit2,
 *   allowance: 0n,
 *   nonce: 42n,
 *   nonceBitmap: 0n,
 * });
 * // requirements contains an approval to Permit2 followed by a signature requirement.
 * ```
 * @internal
 */
export const resolveBundlesPermit2TransferFromRequirements = (
  params: ResolveBundlesPermit2TransferFromRequirementsParams,
): readonly (
  | Readonly<Transaction<ERC20ApprovalAction>>
  | BlueBundlesV1TokenSignatureRequirement
)[] => {
  if (params.amount < 0n) {
    throw new NegativeInputError("amount", params.amount);
  }
  if (params.amount > maxUint256) {
    throw new InputExceedsMaxError({
      field: "amount",
      value: params.amount,
      max: maxUint256,
    });
  }
  if (params.deadline <= 0n) {
    throw new NonPositiveInputError("deadline", params.deadline);
  }
  if (params.deadline > maxUint256) {
    throw new InputExceedsMaxError({
      field: "deadline",
      value: params.deadline,
      max: maxUint256,
    });
  }
  if (params.amount === 0n) return [];
  if (params.nonce < 0n) {
    throw new NegativeInputError("permit2Nonce", params.nonce);
  }
  if (params.nonce > maxUint256) {
    throw new InputExceedsMaxError({
      field: "permit2Nonce",
      value: params.nonce,
      max: maxUint256,
    });
  }

  const bitPosition = params.nonce & 255n;
  if ((params.nonceBitmap & (1n << bitPosition)) !== 0n) {
    throw new Permit2TransferFromNonceAlreadyUsedError(
      params.owner,
      params.nonce,
    );
  }

  return [
    ...getRequirementsApproval({
      address: params.token,
      chainId: params.chainId,
      args: {
        spender: params.permit2,
        spendAmount: params.amount,
        approvalAmount: maxUint256,
      },
      allowances: params.allowance,
    }),
    encodeErc20Permit2TransferFrom({
      token: params.token,
      spender: params.spender,
      amount: params.amount,
      chainId: params.chainId,
      nonce: params.nonce,
      deadline: params.deadline,
    }),
  ];
};
