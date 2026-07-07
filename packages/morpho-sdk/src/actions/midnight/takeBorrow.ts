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
  readonly reduceOnly?: boolean;
  readonly receiver?: Address;
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
  readonly maxContinuousFee?: bigint;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
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
  const reduceOnly = params.reduceOnly ?? false;
  const receiver = params.receiver ?? params.taker;
  const referralFeePct = params.referralFeePct ?? 0n;
  const referralFeeRecipient = params.referralFeeRecipient ?? zeroAddress;
  const maxContinuousFee = params.maxContinuousFee ?? maxUint256;

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
        [],
        params.takeableOffers,
        referralFeePct,
        referralFeeRecipient,
        maxContinuousFee,
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
      type: "midnightTakeBorrow",
      args: {
        market: marketId,
        loanAssets: params.loanAssets,
        maxUnits: params.maxUnits,
        taker: params.taker,
        reduceOnly,
        receiver,
        collateralSupplies: 0,
        takeableOffers: params.takeableOffers.length,
        referralFeePct,
        referralFeeRecipient,
        maxContinuousFee,
        deadline: params.deadline,
      },
    },
  });
};
