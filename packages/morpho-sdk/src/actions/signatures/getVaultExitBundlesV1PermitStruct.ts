import type { Address } from "viem";
import {
  BundlesPermitMismatchError,
  type PermitRequirementSignature,
  VaultExitBundlesV1PermitMismatchError,
} from "../../types/index.js";
import {
  type BundleSharesPermit,
  getBundlesSharesPermit,
} from "../bundles/common.js";

/**
 * Compatibility alias for the canonical {@link BundleSharesPermit} tuple consumed by VaultExitBundlesV1.
 *
 * @deprecated Use {@link BundleSharesPermit}.
 */
export type VaultExitBundlesV1PermitStruct = BundleSharesPermit;

/**
 * Parameters for {@link getVaultExitBundlesV1PermitStruct}.
 *
 * @deprecated Use the parameters of `getBundlesSharesPermit`.
 */
export interface GetVaultExitBundlesV1PermitStructParams {
  /** Vault share token authorized by the permit. */
  readonly vault: Address;
  /** Bundle deadline used by the empty-permit sentinel. */
  readonly deadline: bigint;
  /** Optional expected owner of the signed permit. */
  readonly owner?: Address;
  /** Optional expected spender of the signed permit. */
  readonly spender?: Address;
  /** Optional signed bounded ERC-2612 requirement. */
  readonly requirementSignature?: PermitRequirementSignature;
}

/**
 * Compatibility wrapper for the former VaultExitBundlesV1-specific permit reshaper.
 *
 * @param params.vault - Vault share token authorized by the permit.
 * @param params.deadline - Bundle deadline used by the empty-permit sentinel.
 * @param params.owner - Optional expected owner of the signed permit.
 * @param params.spender - Optional expected spender of the signed permit.
 * @param params.requirementSignature - Optional signed ERC-2612 vault-share requirement.
 * @returns The shared bundles share-permit tuple.
 * @throws {VaultExitBundlesV1PermitMismatchError} when the requirement is incompatible.
 * @deprecated Use `getBundlesSharesPermit`; this wrapper preserves the legacy error identity.
 * @example
 * ```ts
 * import { getVaultExitBundlesV1PermitStruct } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 *
 * const permit = getVaultExitBundlesV1PermitStruct({
 *   vault: zeroAddress,
 *   deadline: 1_900_000_000n,
 * });
 * // permit.value === 0n
 * ```
 */
export const getVaultExitBundlesV1PermitStruct = (
  params: GetVaultExitBundlesV1PermitStructParams,
): VaultExitBundlesV1PermitStruct => {
  try {
    return getBundlesSharesPermit(params);
  } catch (cause) {
    if (cause instanceof BundlesPermitMismatchError) {
      throw new VaultExitBundlesV1PermitMismatchError({
        field: cause.field,
        expected: cause.expected,
        actual: cause.actual,
        cause,
      });
    }
    throw cause;
  }
};
