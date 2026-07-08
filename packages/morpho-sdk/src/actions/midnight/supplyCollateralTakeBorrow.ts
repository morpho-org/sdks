import { MarketUtils, midnightBundlesAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { encodeFunctionData, maxUint256, zeroAddress } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateOfferSides } from "../../helpers/validateOfferSides.js";
import {
  EmptyMidnightTakeableOffersError,
  type MidnightSupplyCollateralTakeBorrowAction,
  MidnightTakeableOfferMarketMismatchError,
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
  type Transaction,
} from "../../types/index.js";
import type { MidnightTakeBorrowParams } from "./takeBorrow.js";
import type { MidnightCollateralSupply } from "./types.js";

/** Parameters for {@link midnightSupplyCollateralTakeBorrow}. */
export interface MidnightSupplyCollateralTakeBorrowParams
  extends MidnightTakeBorrowParams {
  readonly collateralAssets: bigint;
  readonly collateralIndex?: bigint;
}

/** Encodes the supply-collateral-and-take-borrow Midnight bundle. */
export const midnightSupplyCollateralTakeBorrow = (
  params: MidnightSupplyCollateralTakeBorrowParams,
): Readonly<Transaction<MidnightSupplyCollateralTakeBorrowAction>> => {
  if (params.collateralAssets <= 0n) {
    throw new NonPositiveMidnightAmountError(
      "collateralAssets",
      params.collateralAssets,
    );
  }
  if (params.loanAssets <= 0n) {
    throw new NonPositiveMidnightAmountError("loanAssets", params.loanAssets);
  }
  if (params.maxUnits < 0n) {
    throw new NegativeMidnightAmountError("maxUnits", params.maxUnits);
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
    true,
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
  const collateralIndex = params.collateralIndex ?? 0n;
  // Validate that the collateral index is configured before encoding the bundle.
  MarketUtils.getCollateralByIndex(params.market, collateralIndex);
  const collateralSupplies: readonly MidnightCollateralSupply[] = [
    {
      collateralIndex,
      assets: params.collateralAssets,
      permit: { kind: 0, data: "0x" },
    },
  ];

  let tx = {
    to: midnightBundles,
    value: 0n,
    data: encodeFunctionData({
      abi: midnightBundlesAbi,
      functionName: "midnightBundlesV1SupplyCollateralAndSellWithAssetsTarget",
      args: [
        params.loanAssets,
        params.maxUnits,
        params.taker,
        false,
        params.taker,
        collateralSupplies,
        params.takeableOffers,
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
      type: "midnightSupplyCollateralTakeBorrow",
      args: {
        market: marketId,
        collateralAssets: params.collateralAssets,
        loanAssets: params.loanAssets,
        maxUnits: params.maxUnits,
        taker: params.taker,
        receiver: params.taker,
        collateralSupplies: collateralSupplies.length,
        takeableOffers: params.takeableOffers.length,
        deadline: params.deadline,
      },
    },
  });
};
