import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, zeroHash } from "viem";
import { validateUint256Field } from "../../helpers/validate.js";
import {
  BundlesPermitMismatchError,
  type Erc2612RequirementSignature,
  NonPositiveInputError,
} from "../../types/index.js";
import {
  type BundleSharesPermit,
  normalizeBundlesSignature,
} from "./common.js";

/**
 * Creates the contract's empty share-permit sentinel for an allowance-funded withdrawal.
 *
 * @param deadline - Bundle deadline in Unix seconds, already validated by the action builder.
 * @returns A deep-frozen permit tuple with zero value, nonce, and signature fields.
 * @example
 * ```ts
 * import { emptySharesPermit } from "@morpho-org/morpho-sdk";
 *
 * const permit = emptySharesPermit(1_900_000_000n);
 * // permit.value === 0n; permit.v === 0
 * ```
 */
export const emptySharesPermit = (deadline: bigint): BundleSharesPermit =>
  deepFreeze({
    value: 0n,
    nonce: 0n,
    deadline,
    v: 0,
    r: zeroHash,
    s: zeroHash,
  });

/**
 * Validates an ERC-2612 share permit against every expected withdrawal field.
 *
 * Checks both copies of the signed amount and deadline and the nonce metadata. Does not read
 * vault state, derive a safe share allowance, or verify the cryptographic signature.
 *
 * @param signature - Signed ERC-2612 vault-share requirement.
 * @param expected.vault - Vault share token whose allowance is authorized.
 * @param expected.owner - Share owner and transaction sender.
 * @param expected.spender - Registered vault bundles contract.
 * @param expected.shareAllowance - Exact positive share allowance in share base units, not assets.
 * @param expected.deadline - Required common permit and bundle deadline in Unix seconds.
 * @returns A deep-frozen copy of the matching signed requirement.
 * @throws {NonPositiveInputError} when the expected share allowance is not positive.
 * @throws {InputExceedsMaxError} when the expected share allowance exceeds uint256.
 * @throws {BundlesPermitMismatchError} when the permit kind, target, allowance, deadline, or nonce metadata differs.
 * @example
 * ```ts
 * import { validateSharesPermit, type Erc2612RequirementSignature } from "@morpho-org/morpho-sdk";
 * import { getChainAddress } from "@morpho-org/morpho-sdk/addresses";
 * import type { Address } from "viem";
 *
 * export function validateWithdrawalPermit(signature: Erc2612RequirementSignature, owner: Address) {
 *   return validateSharesPermit(signature, {
 *     vault: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
 *     owner,
 *     spender: getChainAddress(1, "bundles.vaultBundlesV1"),
 *     shareAllowance: 1_000_000_000_000_000_000n,
 *     deadline: 1_900_000_000n,
 *   });
 *   // Returns the matching Erc2612RequirementSignature or throws BundlesPermitMismatchError.
 * }
 * ```
 */
export const validateSharesPermit = (
  signature: Erc2612RequirementSignature,
  expected: {
    readonly vault: Address;
    readonly owner: Address;
    readonly spender: Address;
    readonly shareAllowance: bigint;
    readonly deadline: bigint;
  },
): Erc2612RequirementSignature => {
  if (expected.shareAllowance <= 0n) {
    throw new NonPositiveInputError("shareAllowance", expected.shareAllowance);
  }
  // Reject an allowance outside the ABI range before it can reach conversion or encoding.
  validateUint256Field("shareAllowance", expected.shareAllowance);
  if (signature.action.type !== "permit") {
    throw new BundlesPermitMismatchError({
      field: "type",
      expected: "permit",
      actual: signature.action.type,
    });
  }
  for (const [field, actual, target] of [
    ["asset", signature.args.asset, expected.vault],
    ["owner", signature.args.owner, expected.owner],
    ["spender", signature.action.args.spender, expected.spender],
  ] as const) {
    if (!isAddressEqual(actual, target)) {
      throw new BundlesPermitMismatchError({ field, expected: target, actual });
    }
  }
  for (const [field, target, actual, metadata] of [
    [
      "amount",
      expected.shareAllowance,
      signature.args.amount,
      signature.action.args.amount,
    ],
    [
      "deadline",
      expected.deadline,
      signature.args.deadline,
      signature.action.args.deadline,
    ],
  ] as const) {
    if (actual !== target || metadata !== target) {
      throw new BundlesPermitMismatchError({
        field,
        expected: String(target),
        actual: String(actual !== target ? actual : metadata),
      });
    }
  }
  if (signature.action.args.nonce !== signature.args.nonce) {
    throw new BundlesPermitMismatchError({
      field: "nonce",
      expected: String(signature.args.nonce),
      actual: String(signature.action.args.nonce),
    });
  }
  return deepFreeze({
    args: { ...signature.args },
    action: { type: "permit", args: { ...signature.action.args } },
  });
};

/**
 * Converts an ERC-2612 share signature into the contract's permit tuple.
 *
 * Only normalizes the signature encoding and reshapes fields. Use {@link validateSharesPermit}
 * first to bind the permit to a withdrawal's target, share allowance, and deadline.
 *
 * @param signature - Signed ERC-2612 vault-share requirement to convert.
 * @returns A deep-frozen permit tuple with value, nonce, deadline, and normalized v/r/s fields.
 * @throws {BundlesPermitMismatchError} when the serialized signature cannot be normalized.
 * @example
 * ```ts
 * import { toSharesPermitStruct, type Erc2612RequirementSignature } from "@morpho-org/morpho-sdk";
 *
 * export function convertSharePermit(signature: Erc2612RequirementSignature) {
 *   const permit = toSharesPermitStruct(signature);
 *   return permit; // permit.value === signature.args.amount
 * }
 * ```
 */
export const toSharesPermitStruct = (
  signature: Erc2612RequirementSignature,
): BundleSharesPermit =>
  deepFreeze({
    value: signature.args.amount,
    nonce: signature.args.nonce,
    deadline: signature.args.deadline,
    ...normalizeBundlesSignature(signature.args.signature),
  });
