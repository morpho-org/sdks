import {
  type MarketInput,
  MarketUtils,
  type OfferStruct,
} from "@morpho-org/midnight-sdk";
import {
  EmptyMidnightTakeableOffersError,
  MidnightTakeableOfferMarketMismatchError,
} from "../types/index.js";
import { validateOfferSides } from "./validateOfferSides.js";

/**
 * Validates the pure invariants shared by Midnight take entity and action layers.
 *
 * @param params - Selected market, takeable offers, and expected maker side.
 * @returns The selected market id.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when an offer belongs to another market.
 * @internal
 */
export const validateTakeableOffers = (params: {
  readonly market: MarketInput;
  readonly takeableOffers: readonly {
    readonly offer: Pick<OfferStruct, "buy" | "market">;
  }[];
  readonly expectedBuy: boolean;
}) => {
  if (params.takeableOffers.length === 0) {
    throw new EmptyMidnightTakeableOffersError();
  }

  const marketId = MarketUtils.toId(params.market);
  validateOfferSides(
    params.takeableOffers.map((take) => take.offer),
    params.expectedBuy,
  );
  for (const [index, take] of params.takeableOffers.entries()) {
    const actualMarketId = MarketUtils.toId(take.offer.market);
    if (actualMarketId.toLowerCase() !== marketId.toLowerCase()) {
      throw new MidnightTakeableOfferMarketMismatchError({
        index,
        expectedMarket: marketId,
        actualMarket: actualMarketId,
      });
    }
  }

  return marketId;
};
