import type { MidnightCollateralTransfer } from "../types/action.js";
import { DuplicateMidnightCollateralIndexError } from "../types/error.js";

/**
 * Rejects empty batches and repeated collateral indexes.
 * @internal
 * @param transfers - Ordered collateral transfers.
 * @param emptyError - Operation-specific error thrown for an empty batch.
 * @returns Nothing.
 * @throws {DuplicateMidnightCollateralIndexError} when an index appears twice.
 * @example
 * ```ts
 * validateMidnightCollateralBatch(supplies, new EmptyMidnightCollateralSuppliesError());
 * ```
 */
export function validateMidnightCollateralBatch(
  transfers: readonly MidnightCollateralTransfer[],
  emptyError: Error,
): void {
  if (transfers.length === 0) throw emptyError;
  const indexes = new Set<bigint>();
  for (const { collateralIndex } of transfers) {
    if (indexes.has(collateralIndex)) {
      throw new DuplicateMidnightCollateralIndexError(collateralIndex);
    }
    indexes.add(collateralIndex);
  }
}
