import { MathLib } from "@morpho-org/blue-sdk";
import type { BlueReallocation } from "../types/index.js";

/**
 * Computes the vault-asset penalty charged for one BluePublicAllocator call.
 *
 * Mirrors the contract's upward-rounded `assets * penalty / WAD` calculation.
 * Callers must validate that `assets` and `penalty` are within the contract's
 * accepted ranges before encoding a transaction.
 *
 * @param assets - Assets moved by the allocator call.
 * @param penalty - Vault-configured proportional penalty, scaled by WAD.
 * @returns Vault assets transferred by the caller directly to the vault.
 * @example
 * ```ts
 * const penaltyAssets = computeBluePublicAllocatorPenaltyAssets(
 *   1_000_000n,
 *   1_000_000_000_000_000n,
 * );
 * // penaltyAssets === 1_000n
 * ```
 * @internal
 */
export const computeBluePublicAllocatorPenaltyAssets = (
  assets: bigint,
  penalty: bigint,
) => MathLib.wMulUp(assets, penalty);

/**
 * Sums the independently rounded vault-asset penalties in a mixed V1/V2 plan.
 *
 * PublicAllocator V1 entries are ignored because their fees are paid in native
 * token. Each V2 call is rounded independently, matching contract execution.
 *
 * @param reallocations - Mixed PublicAllocator V1 and BluePublicAllocator plan.
 * @returns Total target loan-token assets needed for V2 penalties.
 * @example
 * ```ts
 * const penaltyAssets = computeVaultV2ReallocationPenaltyAssets(reallocations);
 * ```
 * @internal
 */
export const computeVaultV2ReallocationPenaltyAssets = (
  reallocations: readonly BlueReallocation[],
) =>
  reallocations.reduce(
    (total, reallocation) =>
      reallocation.type === "bluePublicAllocator"
        ? total +
          computeBluePublicAllocatorPenaltyAssets(
            reallocation.assets,
            reallocation.penalty,
          )
        : total,
    0n,
  );
