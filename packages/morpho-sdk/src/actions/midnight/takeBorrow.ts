import {
  type MarketInput,
  MarketUtils,
  midnightBundlesAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, zeroAddress } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  EmptyMidnightTakeableOffersError,
  type Metadata,
  MidnightTakeableOfferMarketMismatchError,
  MidnightTakeableOfferSideMismatchError,
  type MidnightTakeBorrowAction,
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
  type Transaction,
} from "../../types/index.js";
import type { MidnightTakeableOffer } from "./types.js";

/** Parameters for {@link midnightTakeBorrow}. */
export interface MidnightTakeBorrowParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly loanAssets: bigint;
  readonly maxUnits: bigint;
  readonly taker: Address;
  readonly receiver?: Address;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  readonly metadata?: Metadata;
}

/** Encodes the take-borrow Midnight bundle. */
export const midnightTakeBorrow = (
  params: MidnightTakeBorrowParams,
): Readonly<Transaction<MidnightTakeBorrowAction>> => {
  if (params.loanAssets <= 0n) {
    throw new NonPositiveMidnightAmountError("loanAssets", params.loanAssets);
  }
  if (params.maxUnits < 0n) {
    throw new NegativeMidnightAmountError("maxUnits", params.maxUnits);
  }
  if (params.takeableOffers.length === 0) {
    throw new EmptyMidnightTakeableOffersError();
  }

  const marketId = MarketUtils.toId({
    market: params.market,
    chainId: params.chainId,
  });
  for (const [index, take] of params.takeableOffers.entries()) {
    if (!take.offer.buy) {
      throw new MidnightTakeableOfferSideMismatchError({
        index,
        expectedBuy: true,
        actualBuy: take.offer.buy,
      });
    }

    const actualMarketId = MarketUtils.toId({
      market: take.offer.market,
      chainId: params.chainId,
    });
    if (actualMarketId.toLowerCase() !== marketId.toLowerCase()) {
      throw new MidnightTakeableOfferMarketMismatchError({
        index,
        expectedMarket: marketId,
        actualMarket: actualMarketId,
      });
    }
  }

  const midnightBundles = getChainAddress(params.chainId, "midnightBundles");
  const receiver = params.receiver ?? params.taker;

  let tx = {
    to: midnightBundles,
    value: 0n,
    data: encodeFunctionData({
      abi: midnightBundlesAbi,
      functionName: "supplyCollateralAndSellWithAssetsTarget",
      args: [
        params.loanAssets,
        params.maxUnits,
        params.taker,
        receiver,
        [],
        params.takeableOffers,
        0n,
        zeroAddress,
      ],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightTakeBorrow",
      args: {
        market: marketId,
        loanAssets: params.loanAssets,
        maxUnits: params.maxUnits,
        taker: params.taker,
        receiver,
        takeableOffers: params.takeableOffers.length,
      },
    },
  });
};
