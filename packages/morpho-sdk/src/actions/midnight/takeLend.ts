import {
  type MarketInput,
  MarketUtils,
  midnightBundlesAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  encodeFunctionData,
  maxUint256,
  zeroAddress,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateOfferSides } from "../../helpers/validateOfferSides.js";
import {
  EmptyMidnightTakeableOffersError,
  type Metadata,
  MidnightTakeableOfferMarketMismatchError,
  type MidnightTakeLendAction,
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
  type Transaction,
} from "../../types/index.js";
import type { MidnightTakeableOffer } from "./types.js";

/** Parameters for {@link midnightTakeLend}. */
export interface MidnightTakeLendParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly assets: bigint;
  readonly minUnits: bigint;
  readonly taker: Address;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

/** Encodes the take-lend Midnight bundle. */
export const midnightTakeLend = (
  params: MidnightTakeLendParams,
): Readonly<Transaction<MidnightTakeLendAction>> => {
  if (params.assets <= 0n) {
    throw new NonPositiveMidnightAmountError("assets", params.assets);
  }
  if (params.minUnits < 0n) {
    throw new NegativeMidnightAmountError("minUnits", params.minUnits);
  }
  if (params.deadline < 0n) {
    throw new NegativeMidnightAmountError("deadline", params.deadline);
  }
  if (params.takeableOffers.length === 0) {
    throw new EmptyMidnightTakeableOffersError();
  }

  const marketId = MarketUtils.toId(params.market);
  validateOfferSides(
    params.takeableOffers.map((take) => take.offer),
    false,
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

  const midnightBundles = getChainAddress(params.chainId, "midnightBundles");

  let tx = {
    to: midnightBundles,
    value: 0n,
    data: encodeFunctionData({
      abi: midnightBundlesAbi,
      functionName: "midnightBundlesV1BuyWithAssetsTargetAndWithdrawCollateral",
      args: [
        params.assets,
        params.minUnits,
        params.taker,
        false,
        { kind: 0, data: "0x" },
        params.takeableOffers,
        [],
        zeroAddress,
        0n,
        zeroAddress,
        maxUint256,
        params.deadline,
      ],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightTakeLend",
      args: {
        market: marketId,
        assets: params.assets,
        minUnits: params.minUnits,
        taker: params.taker,
        takeableOffers: params.takeableOffers.length,
        deadline: params.deadline,
      },
    },
  });
};
