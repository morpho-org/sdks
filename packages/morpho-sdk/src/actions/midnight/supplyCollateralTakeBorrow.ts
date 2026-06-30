import { MarketUtils, midnightBundlesAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { encodeFunctionData, zeroAddress } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateOfferSides } from "../../helpers/validateOfferSides.js";
import {
  type AnyRequirementSignature,
  EmptyMidnightTakeableOffersError,
  type MidnightSupplyCollateralTakeBorrowAction,
  MidnightTakeableOfferMarketMismatchError,
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
  type Transaction,
  UnknownMidnightCollateralError,
} from "../../types/index.js";
import { encodeMidnightTokenPermit } from "./encodeMidnightTokenPermit.js";
import type { MidnightTakeBorrowParams } from "./takeBorrow.js";
import type { MidnightCollateralSupply } from "./types.js";

/** Parameters for {@link midnightSupplyCollateralTakeBorrow}. */
export interface MidnightSupplyCollateralTakeBorrowParams
  extends MidnightTakeBorrowParams {
  readonly collateralAssets: bigint;
  readonly collateralIndex?: bigint;
  readonly signatures?:
    | AnyRequirementSignature
    | readonly AnyRequirementSignature[];
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
  const market = MarketUtils.toStruct(params.market);
  const collateralIndex = params.collateralIndex ?? 0n;
  const collateral = market.collateralParams[Number(collateralIndex)];
  if (collateral == null) {
    throw new UnknownMidnightCollateralError({
      market: marketId,
      collateralIndex,
    });
  }
  const collateralSupplies: readonly MidnightCollateralSupply[] = [
    {
      collateralIndex,
      assets: params.collateralAssets,
      permit: encodeMidnightTokenPermit({
        token: collateral.token,
        owner: params.taker,
        spender: midnightBundles,
        amount: params.collateralAssets,
        signatures: params.signatures,
      }),
    },
  ];
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
        collateralSupplies,
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
      type: "midnightSupplyCollateralTakeBorrow",
      args: {
        market: marketId,
        collateralAssets: params.collateralAssets,
        loanAssets: params.loanAssets,
        maxUnits: params.maxUnits,
        taker: params.taker,
        receiver,
        takeableOffers: params.takeableOffers.length,
      },
    },
  });
};
