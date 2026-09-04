import { type Address, type Hex, isAddressEqual, zeroHash } from "viem";
import {
  type PermitRequirementSignature,
  VaultExitBundlesV1PermitMismatchError,
} from "../../types/index.js";
import { normalizeEcdsaSignature } from "./normalizeEcdsaSignature.js";

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
  /** Optional signed bounded ERC-2612 requirement. */
  readonly requirementSignature?: PermitRequirementSignature;
}

/**
 * Returns the permit struct consumed by VaultExitBundlesV1 from an optional vault-share
 * requirement signature.
 *
 * Without a signature, returns the contract's empty-permit sentinel. With a signature, validates
 * the ERC-2612 kind and vault asset before splitting the serialized signature.
 * Owner, spender, deadline, nonce, and cryptographic validity are verified onchain by the vault.
 *
 * @param params.vault - Vault share token authorized by the permit.
 * @param params.deadline - Bundle deadline used by the empty-permit sentinel.
 * @param params.requirementSignature - Optional signed bounded ERC-2612 requirement.
 * @returns The VaultExitBundlesV1 permit tuple.
 * @throws {VaultExitBundlesV1PermitMismatchError} when the requirement has the wrong permit kind, asset, or signature encoding.
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
      value: 0n,
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
  const { v, r, s } = normalizeEcdsaSignature(
    requirementSignature.args.signature,
    ({ expected, cause }) =>
      new VaultExitBundlesV1PermitMismatchError({
        field: "signature",
        expected,
        actual: requirementSignature.args.signature,
        cause,
      }),
  );
  return {
    value: requirementSignature.args.amount,
    nonce: requirementSignature.args.nonce,
    deadline: requirementSignature.args.deadline,
    v,
    r,
    s,
  };
};
