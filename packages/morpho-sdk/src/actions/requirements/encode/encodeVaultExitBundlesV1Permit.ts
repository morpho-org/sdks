import {
  type Address,
  isAddressEqual,
  maxUint256,
  parseSignature,
  zeroHash,
} from "viem";
import {
  InKindRedeemPermitMismatchError,
  type PermitRequirementSignature,
} from "../../../types/index.js";

/** Permit tuple consumed by VaultExitBundlesV1. */
export interface VaultExitBundlesV1Permit {
  /** Vault-share allowance authorized by the permit. */
  readonly value: bigint;
  /** Vault permit nonce signed by the owner. */
  readonly nonce: bigint;
  /** Timestamp after which the permit is invalid. */
  readonly deadline: bigint;
  /** ECDSA recovery identifier, or zero for the empty-permit sentinel. */
  readonly v: number;
  /** ECDSA signature `r`, or zero for the empty-permit sentinel. */
  readonly r: `0x${string}`;
  /** ECDSA signature `s`, or zero for the empty-permit sentinel. */
  readonly s: `0x${string}`;
}

/** Parameters for {@link encodeVaultExitBundlesV1Permit}. */
export interface EncodeVaultExitBundlesV1PermitParams {
  /** Vault share token authorized by the permit. */
  readonly vault: Address;
  /** Bundle deadline used by the empty-permit sentinel. */
  readonly deadline: bigint;
  /** Optional signed max-share ERC-2612 requirement. */
  readonly requirementSignature?: PermitRequirementSignature;
}

/**
 * Encodes an optional vault-share requirement signature as the permit tuple consumed by
 * VaultExitBundlesV1.
 *
 * Without a signature, returns the contract's empty-permit sentinel. With a signature, validates
 * the ERC-2612 kind, vault asset, and max-share amount before splitting the serialized signature.
 * Owner, spender, deadline, nonce, and cryptographic validity are verified onchain by the vault.
 *
 * @param params - Vault permit encoding parameters.
 * @returns The VaultExitBundlesV1 permit tuple.
 * @throws {InKindRedeemPermitMismatchError} when the requirement has the wrong permit kind, asset, amount, or signature encoding.
 * @example
 * ```ts
 * import { encodeVaultExitBundlesV1Permit } from "@morpho-org/morpho-sdk";
 *
 * const permit = encodeVaultExitBundlesV1Permit({
 *   vault,
 *   deadline,
 *   requirementSignature,
 * });
 * ```
 */
export const encodeVaultExitBundlesV1Permit = (
  params: EncodeVaultExitBundlesV1PermitParams,
): VaultExitBundlesV1Permit => {
  const { requirementSignature } = params;
  if (requirementSignature == null) {
    return {
      value: maxUint256,
      nonce: 0n,
      deadline: params.deadline,
      v: 0,
      r: zeroHash,
      s: zeroHash,
    };
  }

  if (requirementSignature.action.type !== "permit") {
    throw new InKindRedeemPermitMismatchError({
      field: "type",
      expected: "permit",
      actual: requirementSignature.action.type,
    });
  }
  if (!isAddressEqual(requirementSignature.args.asset, params.vault)) {
    throw new InKindRedeemPermitMismatchError({
      field: "asset",
      expected: params.vault,
      actual: requirementSignature.args.asset,
    });
  }
  if (requirementSignature.args.amount !== maxUint256) {
    throw new InKindRedeemPermitMismatchError({
      field: "amount",
      expected: String(maxUint256),
      actual: String(requirementSignature.args.amount),
    });
  }
  const signature = (() => {
    try {
      return parseSignature(requirementSignature.args.signature);
    } catch {
      throw new InKindRedeemPermitMismatchError({
        field: "signature",
        expected: "a 64-byte compact or 65-byte serialized ECDSA signature",
        actual: requirementSignature.args.signature,
      });
    }
  })();

  const { r, s, v, yParity } = signature;
  return {
    value: maxUint256,
    nonce: requirementSignature.args.nonce,
    deadline: requirementSignature.args.deadline,
    v: Number(v ?? BigInt(yParity + 27)),
    r,
    s,
  };
};
