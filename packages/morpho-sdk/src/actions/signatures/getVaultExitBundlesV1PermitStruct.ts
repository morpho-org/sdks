import type { Address } from "viem";
import {
  BundlesPermitMismatchError,
  type PermitRequirementSignature,
  VaultExitBundlesV1PermitMismatchError,
} from "../../types/index.js";
import {
  type BundlesSharesPermit,
  getBundlesSharesPermit,
} from "../bundles/index.js";

/**
 * Permit tuple consumed by VaultExitBundlesV1.
 *
 * @deprecated Use {@link BundlesSharesPermit}.
 */
export interface VaultExitBundlesV1PermitStruct extends BundlesSharesPermit {}

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
  /** Optional signed bounded ERC-2612 requirement. */
  readonly requirementSignature?: PermitRequirementSignature;
}

/**
 * Compatibility wrapper for the former VaultExitBundlesV1-specific permit reshaper.
 *
 * @param params - Vault share permit values.
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
