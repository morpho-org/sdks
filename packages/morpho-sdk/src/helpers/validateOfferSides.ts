import { MidnightOfferSideMismatchError } from "../types/index.js";

/** @internal Validates that Midnight offers match a named flow's maker side. */
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
