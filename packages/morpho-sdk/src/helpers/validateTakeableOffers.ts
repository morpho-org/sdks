import type { MarketInput, OfferStruct } from "@morpho-org/midnight-sdk";
import { isAddressEqual, zeroAddress } from "viem";
import {
  EmptyMidnightTakeableOffersError,
  MidnightTakeableOfferMarketMismatchError,
  MidnightTakeableOfferZeroSellerReceiverError,
} from "../types/index.js";
import { encodeMidnightMarketId } from "./encodeMidnightCalldata.js";
import { validateMidnightAddress } from "./validateMidnightAccount.js";
import { validateOfferSides } from "./validateOfferSides.js";

/**
 * Validates the pure invariants shared by Midnight take entity and action layers.
 *
 * @param params - Selected market, takeable offers, and expected maker side.
 * @returns The selected market id.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when an offer belongs to another market.
 * @throws {MidnightTakeableOfferZeroSellerReceiverError} when a sell offer routes seller proceeds to the zero address.
 * @throws {MidnightCalldataEncodingError} when a market cannot be ABI-encoded or a sell offer's
 *   `receiverIfMakerIsSeller` is not an address.
 * @internal
 */
export const validateTakeableOffers = (params: {
  readonly market: MarketInput;
  readonly takeableOffers: readonly {
    readonly offer: Pick<
      OfferStruct,
      "buy" | "market" | "receiverIfMakerIsSeller"
    >;
  }[];
  readonly expectedBuy: boolean;
}) => {
  if (params.takeableOffers.length === 0) {
    throw new EmptyMidnightTakeableOffersError();
  }

  const marketId = encodeMidnightMarketId(params.market);
  validateOfferSides(
    params.takeableOffers.map((take) => take.offer),
    params.expectedBuy,
  );
  for (const [index, take] of params.takeableOffers.entries()) {
    const actualMarketId = encodeMidnightMarketId(take.offer.market);
    if (actualMarketId.toLowerCase() !== marketId.toLowerCase()) {
      throw new MidnightTakeableOfferMarketMismatchError({
        index,
        expectedMarket: marketId,
        actualMarket: actualMarketId,
      });
    }
    if (take.offer.buy) continue;
    // Reject a malformed address before viem compares it.
    validateMidnightAddress(
      `takeableOffers[${index}].offer.receiverIfMakerIsSeller`,
      take.offer.receiverIfMakerIsSeller,
    );
    if (isAddressEqual(take.offer.receiverIfMakerIsSeller, zeroAddress)) {
      throw new MidnightTakeableOfferZeroSellerReceiverError({ index });
    }
  }

  return marketId;
};
