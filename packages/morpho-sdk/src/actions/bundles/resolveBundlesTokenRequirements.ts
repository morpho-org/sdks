import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { maxUint256 } from "viem";
import { validateUint256Field } from "../../helpers/validate.js";
import { validateRequirementSpender } from "../../helpers/validateRequirementSpender.js";
import {
  ApprovalAmountLessThanSpendAmountError,
  type BundlesTokenSignatureRequirement,
  type ERC20ApprovalAction,
  InputExceedsMaxError,
  NegativeInputError,
  Permit2SignatureTransferNonceAlreadyUsedError,
  type Transaction,
} from "../../types/index.js";
import { encodeErc20Permit2SignatureTransfer } from "../requirements/encode/index.js";
import { getRequirementsApproval } from "../requirements/getRequirementsApproval.js";

/** Plain onchain state used by {@link resolveBundlesTokenRequirements}. */
export type BundlesTokenRequirementsState =
  | {
      readonly type: "approval";
      /** Current allowance of the funding token for `spender`. */
      readonly allowance: bigint;
      /** Allowance to set when the current allowance cannot cover `amount`. */
      readonly approvalAmount: bigint;
    }
  | {
      readonly type: "permit2SignatureTransfer";
      readonly permit2Allowance: bigint;
      readonly permit2Nonce: bigint;
      readonly nonceBitmap: bigint;
    };

/**
 * Resolves pre-fetched allowance and Permit2 nonce state into ordered bundles requirements.
 *
 * `spender` is validated against the chain registry's fixed bundles deployments, and the
 * SignatureTransfer branch resolves canonical Permit2 from that same registry, so no caller can
 * route an approval or a signed pull to an address the SDK does not know.
 *
 * The SignatureTransfer branch always places any ERC-20 approval to canonical Permit2 before the
 * one-time signature requirement.
 *
 * @param params - Funding values, expected bundles spender, and pre-fetched state.
 * @param params.token - ERC-20 token funded by the operation.
 * @param params.spender - Registered fixed bundles contract that pulls the token; must be the
 *   chain's BlueBundlesV1 or VaultBundlesV1 deployment.
 * @param params.owner - Account funding the operation and owning the Permit2 nonce bitmap.
 * @param params.chainId - Target chain id used to resolve supported approval spenders and canonical Permit2.
 * @param params.amount - Exact pull amount in the token's smallest unit; zero returns no requirements.
 * @param params.deadline - Signature expiration as a Unix timestamp in seconds.
 * @param params.state - Prefetched state for either classic approval or Permit2 SignatureTransfer.
 * @param params.state.type - `approval` for a direct allowance or `permit2SignatureTransfer` for a signed pull.
 * @param params.state.allowance - In the approval branch, current token allowance from `owner` to `spender`.
 * @param params.state.approvalAmount - In the approval branch, allowance to set if needed; must cover `amount`.
 * @param params.state.permit2Allowance - In the SignatureTransfer branch, current token allowance from `owner` to canonical Permit2.
 * @param params.state.permit2Nonce - In the SignatureTransfer branch, caller-selected unused uint256 unordered nonce.
 * @param params.state.nonceBitmap - In the SignatureTransfer branch, owner's Permit2 bitmap word at `permit2Nonce >> 8n`.
 * @returns Ordered approval transactions and/or a Permit2 SignatureTransfer requirement.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the address registry.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not the chain's registered
 *   BlueBundlesV1 or VaultBundlesV1 deployment, including for a zero-amount request.
 * @throws {NegativeInputError} when an amount or Permit2 nonce is negative.
 * @throws {InputExceedsMaxError} when `amount` or the Permit2 nonce exceeds uint256.
 * @throws {Permit2SignatureTransferNonceAlreadyUsedError} when the selected nonce bit is set.
 * @throws {ApprovalAmountLessThanSpendAmountError} when a classic approval cannot cover the pull.
 * @throws {UnknownAddressError} when the SignatureTransfer branch runs on a chain without canonical Permit2.
 * @example
 * ```ts
 * import { resolveBundlesTokenRequirements } from "@morpho-org/morpho-sdk";
 * import { getChainAddress } from "@morpho-org/morpho-ts";
 * import { zeroAddress } from "viem";
 *
 * const requirements = resolveBundlesTokenRequirements({
 *   token: zeroAddress,
 *   spender: getChainAddress(1, "bundles.vaultBundlesV1"),
 *   owner: zeroAddress,
 *   chainId: 1,
 *   amount: 1_000_000n,
 *   deadline: 1_900_000_000n,
 *   state: { type: "approval", allowance: 1_000_000n, approvalAmount: 1_000_000n },
 * });
 * // requirements is empty because the allowance already covers the amount.
 * ```
 */
export const resolveBundlesTokenRequirements = (params: {
  readonly token: Address;
  readonly spender: Address;
  readonly owner: Address;
  readonly chainId: number;
  readonly amount: bigint;
  readonly deadline: bigint;
  readonly state: BundlesTokenRequirementsState;
}): readonly (
  | Readonly<Transaction<ERC20ApprovalAction>>
  | BundlesTokenSignatureRequirement
)[] => {
  // Bind the caller-supplied spender to the chain registry before anything else: a sufficient
  // allowance short-circuits the approval encoder, so this is the only guard that keeps an
  // unregistered spender from being accepted on every path, zero-amount requests included.
  validateRequirementSpender({
    chainId: params.chainId,
    spender: params.spender,
    allowed: ["blueBundlesV1", "vaultBundlesV1"],
  });
  // Reject invalid pulls before an approval encoder can cap the requested amount.
  validateUint256Field("amount", params.amount);
  if (params.amount === 0n) return [];

  if (params.state.type === "approval") {
    if (params.state.approvalAmount < params.amount) {
      throw new ApprovalAmountLessThanSpendAmountError();
    }
    return getRequirementsApproval({
      address: params.token,
      chainId: params.chainId,
      args: {
        // Compare against the bounded pull to avoid redundant approvals and USDT zero-resets.
        spender: params.spender,
        spendAmount: params.amount,
        approvalAmount: params.state.approvalAmount,
      },
      allowances: params.state.allowance,
    });
  }

  if (params.state.permit2Nonce < 0n) {
    throw new NegativeInputError("permit2Nonce", params.state.permit2Nonce);
  }
  if (params.state.permit2Nonce > maxUint256) {
    throw new InputExceedsMaxError({
      field: "permit2Nonce",
      value: params.state.permit2Nonce,
      max: maxUint256,
    });
  }
  const bitPosition = params.state.permit2Nonce & 255n;
  if ((params.state.nonceBitmap & (1n << bitPosition)) !== 0n) {
    throw new Permit2SignatureTransferNonceAlreadyUsedError(
      params.owner,
      params.state.permit2Nonce,
    );
  }
  // Canonical Permit2 is the only address the signed pull can be funded through, so resolve it from
  // the chain registry instead of trusting a caller-supplied one. Throws when the chain has none.
  const permit2 = getChainAddress(params.chainId, "permit2");
  return [
    ...getRequirementsApproval({
      address: params.token,
      chainId: params.chainId,
      args: {
        spender: permit2,
        spendAmount: params.amount,
        approvalAmount: maxUint256,
      },
      allowances: params.state.permit2Allowance,
    }),
    encodeErc20Permit2SignatureTransfer({
      token: params.token,
      spender: params.spender,
      amount: params.amount,
      chainId: params.chainId,
      nonce: params.state.permit2Nonce,
      deadline: params.deadline,
    }),
  ];
};
