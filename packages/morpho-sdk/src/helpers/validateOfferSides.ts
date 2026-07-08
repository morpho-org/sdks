import { MidnightOfferSideMismatchError } from "../types/index.js";

/**
 * Validates that Midnight offers match a named flow's maker side.
 *
 * Use before encoding a side-specific Midnight action: make-lend and
 * take-borrow consume buy offers (`expectedBuy: true`), while make-borrow and
 * take-lend consume sell offers (`expectedBuy: false`).
 *
 * @param offers - Offers to validate.
 * @param expectedBuy - Expected maker side for every offer.
 * @throws {MidnightOfferSideMismatchError} when any offer side differs from `expectedBuy`.
 * @example
 * ```ts
 * import { validateOfferSides } from "@morpho-org/morpho-sdk";
 *
 * validateOfferSides(takeableOffers.map((take) => take.offer), false);
 * ```
 */
export const validateOfferSides = (
  offers: Iterable<{ readonly buy: boolean }>,
  expectedBuy: boolean,
) => {
  let index = 0;
  for (const offer of offers) {
    if (offer.buy !== expectedBuy) {
      throw new MidnightOfferSideMismatchError({
        index,
        expectedBuy,
        actualBuy: offer.buy,
      });
    }
    index += 1;
  }
};
