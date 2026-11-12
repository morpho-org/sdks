import { type MarketInput, MarketUtils } from "@morpho-org/midnight-sdk";
import type { MidnightCollateralTransfer } from "../types/index.js";
import {
  validateMidnightCollateralSupplySums,
  validateMidnightUint128Field,
} from "./validateMidnightBounds.js";
import { validatePositiveInput } from "./validatePositiveInput.js";

/**
 * Validates collateral supply entries and their per-index totals.
 *
 * @param params - Market, error-field prefix, and collateral supplies.
 * @returns Nothing when every entry and total is valid; accepts an empty list.
 * @throws {NonPositiveInputError} when an entry is not positive.
 * @throws {InputExceedsMaxError} when an entry or per-index sum exceeds uint128.
 * @throws {UnknownCollateralIndexError} when an index is not configured on the market.
 * @internal
 */
export const validateMidnightCollateralSupplies = (params: {
  readonly market: MarketInput;
  readonly field: string;
  readonly supplies: readonly MidnightCollateralTransfer[];
}): void => {
  for (const [
    index,
    { collateralIndex, assets },
  ] of params.supplies.entries()) {
    const field = `${params.field}[${index}].assets`;
    // Validation only; rejects non-positive supply amounts.
    validatePositiveInput(field, assets);
    validateMidnightUint128Field(field, assets);
    // Validation only; rejects indices not configured on the market.
    MarketUtils.getCollateralByIndex(params.market, collateralIndex);
  }
  validateMidnightCollateralSupplySums(params.field, params.supplies);
};
