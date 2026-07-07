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
  type AnyRequirementSignature,
  EmptyMidnightTakeableOffersError,
  type Metadata,
  MidnightTakeableOfferMarketMismatchError,
  type MidnightTakeLendAction,
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
  type Transaction,
} from "../../types/index.js";
import { getMidnightTokenPermit } from "../signatures/getMidnightTokenPermit.js";
import type {
  MidnightCollateralWithdrawal,
  MidnightTakeableOffer,
} from "./types.js";

/** Parameters for {@link midnightTakeLend}. */
export interface MidnightTakeLendParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly assets: bigint;
  readonly minUnits: bigint;
  readonly taker: Address;
  readonly reduceOnly?: boolean;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  readonly collateralWithdrawals?: readonly MidnightCollateralWithdrawal[];
  readonly collateralReceiver?: Address;
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
  readonly maxContinuousFee?: bigint;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly signatures?:
    | AnyRequirementSignature
    | readonly AnyRequirementSignature[];
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
  const reduceOnly = params.reduceOnly ?? false;
  const collateralWithdrawals = params.collateralWithdrawals ?? [];
  for (const [index, withdrawal] of collateralWithdrawals.entries()) {
    if (withdrawal.collateralIndex < 0n) {
      throw new NegativeMidnightAmountError(
        `collateralWithdrawals[${index}].collateralIndex`,
        withdrawal.collateralIndex,
      );
    }
    if (withdrawal.assets < 0n) {
      throw new NegativeMidnightAmountError(
        `collateralWithdrawals[${index}].assets`,
        withdrawal.assets,
      );
    }
  }
  const collateralReceiver = params.collateralReceiver ?? zeroAddress;
  const referralFeePct = params.referralFeePct ?? 0n;
  const referralFeeRecipient = params.referralFeeRecipient ?? zeroAddress;
  const maxContinuousFee = params.maxContinuousFee ?? maxUint256;
  const loanTokenPermit = getMidnightTokenPermit({
    token: MarketUtils.toStruct(params.market).loanToken,
    owner: params.taker,
    spender: midnightBundles,
    amount: params.assets,
    signatures: params.signatures,
  });

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
        reduceOnly,
        loanTokenPermit,
        params.takeableOffers,
        collateralWithdrawals,
        collateralReceiver,
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
      type: "midnightTakeLend",
      args: {
        market: marketId,
        assets: params.assets,
        minUnits: params.minUnits,
        taker: params.taker,
        reduceOnly,
        takeableOffers: params.takeableOffers.length,
        collateralWithdrawals: collateralWithdrawals.length,
        collateralReceiver,
        referralFeePct,
        referralFeeRecipient,
        maxContinuousFee,
        deadline: params.deadline,
      },
    },
  });
};
