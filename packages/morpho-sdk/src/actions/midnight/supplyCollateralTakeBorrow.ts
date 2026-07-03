import { MarketUtils, midnightBundlesAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { encodeFunctionData, maxUint256, zeroAddress } from "viem";
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
import { getMidnightTokenPermit } from "../signatures/getMidnightTokenPermit.js";
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
  if ((params.referralFeePct ?? 0n) < 0n) {
    throw new NegativeMidnightAmountError(
      "referralFeePct",
      params.referralFeePct ?? 0n,
    );
  }
  if ((params.maxContinuousFee ?? maxUint256) < 0n) {
    throw new NegativeMidnightAmountError(
      "maxContinuousFee",
      params.maxContinuousFee ?? maxUint256,
    );
  }
  if ((params.deadline ?? maxUint256) < 0n) {
    throw new NegativeMidnightAmountError("deadline", params.deadline ?? 0n);
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
      permit: getMidnightTokenPermit({
        token: collateral.token,
        owner: params.taker,
        spender: midnightBundles,
        amount: params.collateralAssets,
        signatures: params.signatures,
      }),
    },
  ];
  const reduceOnly = params.reduceOnly ?? false;
  const receiver = params.receiver ?? params.taker;
  const referralFeePct = params.referralFeePct ?? 0n;
  const referralFeeRecipient = params.referralFeeRecipient ?? zeroAddress;
  const maxContinuousFee = params.maxContinuousFee ?? maxUint256;
  const deadline = params.deadline ?? maxUint256;

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
        reduceOnly,
        receiver,
        collateralSupplies,
        params.takeableOffers,
        referralFeePct,
        referralFeeRecipient,
        maxContinuousFee,
        deadline,
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
        reduceOnly,
        receiver,
        collateralSupplies: collateralSupplies.length,
        takeableOffers: params.takeableOffers.length,
        referralFeePct,
        referralFeeRecipient,
        maxContinuousFee,
        deadline,
      },
    },
  });
};
