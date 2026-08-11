import {
  type Address,
  compactSignatureToSignature,
  type Hex,
  isAddressEqual,
  maxUint256,
  parseCompactSignature,
  parseSignature,
  size,
  zeroHash,
} from "viem";
import {
  type PermitRequirementSignature,
  VaultExitBundlesV1PermitMismatchError,
} from "../../types/index.js";

/** Permit tuple consumed by VaultExitBundlesV1. */
export interface VaultExitBundlesV1PermitStruct {
  /** Vault-share allowance authorized by the permit. */
  readonly value: bigint;
  /** Vault permit nonce signed by the owner. */
  readonly nonce: bigint;
  /** Timestamp after which the permit is invalid. */
  readonly deadline: bigint;
  /** ECDSA recovery identifier, or zero for the empty-permit sentinel. */
  readonly v: number;
  /** ECDSA signature `r`, or zero for the empty-permit sentinel. */
  readonly r: Hex;
  /** ECDSA signature `s`, or zero for the empty-permit sentinel. */
  readonly s: Hex;
}

/** Parameters for {@link getVaultExitBundlesV1PermitStruct}. */
export interface GetVaultExitBundlesV1PermitStructParams {
  /** Vault share token authorized by the permit. */
  readonly vault: Address;
  /** Bundle deadline used by the empty-permit sentinel. */
  readonly deadline: bigint;
  /** Optional signed max-share ERC-2612 requirement. */
  readonly requirementSignature?: PermitRequirementSignature;
}

/**
 * Returns the permit struct consumed by VaultExitBundlesV1 from an optional vault-share
 * requirement signature.
 *
 * Without a signature, returns the contract's empty-permit sentinel. With a signature, validates
 * the ERC-2612 kind, vault asset, and max-share amount before splitting the serialized signature.
 * Owner, spender, deadline, nonce, and cryptographic validity are verified onchain by the vault.
 *
 * @param params.vault - Vault share token authorized by the permit.
 * @param params.deadline - Bundle deadline used by the empty-permit sentinel.
 * @param params.requirementSignature - Optional signed max-share ERC-2612 requirement.
 * @returns The VaultExitBundlesV1 permit tuple.
 * @throws {VaultExitBundlesV1PermitMismatchError} when the requirement has the wrong permit kind, asset, amount, or signature encoding.
 * @example
 * ```ts
 * import { getVaultExitBundlesV1PermitStruct } from "@morpho-org/morpho-sdk";
 *
 * const permit = getVaultExitBundlesV1PermitStruct({
 *   vault,
 *   deadline,
 *   requirementSignature,
 * });
 * // permit satisfies VaultExitBundlesV1PermitStruct
 * ```
 */
export const getVaultExitBundlesV1PermitStruct = (
  params: GetVaultExitBundlesV1PermitStructParams,
): VaultExitBundlesV1PermitStruct => {
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
    throw new VaultExitBundlesV1PermitMismatchError({
      field: "type",
      expected: "permit",
      actual: requirementSignature.action.type,
    });
  }
  if (!isAddressEqual(requirementSignature.args.asset, params.vault)) {
    throw new VaultExitBundlesV1PermitMismatchError({
      field: "asset",
      expected: params.vault,
      actual: requirementSignature.args.asset,
    });
  }
  if (requirementSignature.args.amount !== maxUint256) {
    throw new VaultExitBundlesV1PermitMismatchError({
      field: "amount",
      expected: String(maxUint256),
      actual: String(requirementSignature.args.amount),
    });
  }
  const signature = (() => {
    try {
      const serializedSignature = requirementSignature.args.signature;
      return size(serializedSignature) === 64
        ? compactSignatureToSignature(
            parseCompactSignature(serializedSignature),
          )
        : parseSignature(serializedSignature);
    } catch (cause) {
      throw new VaultExitBundlesV1PermitMismatchError({
        field: "signature",
        expected: "a 64-byte compact or 65-byte serialized ECDSA signature",
        actual: requirementSignature.args.signature,
        cause,
      });
    }
  })();

  const { r, s, v, yParity } = signature;
  const normalizedV = v ?? (yParity == null ? undefined : BigInt(yParity + 27));
  if (normalizedV == null) {
    throw new VaultExitBundlesV1PermitMismatchError({
      field: "signature",
      expected: "a signature containing v or yParity",
      actual: requirementSignature.args.signature,
    });
  }
  return {
    value: maxUint256,
    nonce: requirementSignature.args.nonce,
    deadline: requirementSignature.args.deadline,
    v: Number(normalizedV),
    r,
    s,
  };
};
