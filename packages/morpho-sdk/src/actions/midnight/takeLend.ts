import {
  type MarketInput,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { encodeFunctionData, zeroAddress } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  validateDeadline,
  validateReferralFee,
} from "../../helpers/validate.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateTakeableOffers } from "../../helpers/validateTakeableOffers.js";
import {
  type Metadata,
  type MidnightBuyTarget,
  type MidnightTakeLendAction,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import type {
  MidnightReferralFeeParams,
  MidnightTakeableOffer,
} from "./types.js";

/** Parameters for encoding a Midnight lend take from already selected offers. */
export interface MidnightTakeLendParams extends MidnightReferralFeeParams {
  readonly chainId: number;
  readonly market: MarketInput;
  /** Loan assets paid with a unit floor, or units bought with a loan-asset cap. */
  readonly target: MidnightBuyTarget;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  /** Largest market continuous fee accepted when taking offers. Pass `maxUint256` explicitly for no cap. */
  readonly maxContinuousFee: bigint;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

const validateParams = (params: MidnightTakeLendParams) => {
  // Reject markets from another chain deployment before checking offers against them.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = validateTakeableOffers({
    market: params.market,
    takeableOffers: params.takeableOffers,
    expectedBuy: false,
  });

  const { target } = params;
  if (target.type === "assets") {
    if (target.assets <= 0n) {
      throw new NonPositiveInputError("target.assets", target.assets);
    }
    if (target.minUnits < 0n) {
      throw new NegativeInputError("target.minUnits", target.minUnits);
    }
  } else {
    if (target.units <= 0n) {
      throw new NonPositiveInputError("target.units", target.units);
    }
    if (target.maxBuyerAssets <= 0n) {
      throw new NonPositiveInputError(
        "target.maxBuyerAssets",
        target.maxBuyerAssets,
      );
    }
  }
  if (params.maxContinuousFee < 0n) {
    throw new NegativeInputError("maxContinuousFee", params.maxContinuousFee);
  }
  validateDeadline(params.deadline);
  const { referralFeePct, referralFeeRecipient } = validateReferralFee(params);
  return { marketId, referralFeePct, referralFeeRecipient };
};

/**
 * Encodes a `MidnightBundlesV2` buy that lends into borrow-side offers for `msg.sender`.
 *
 * Prefer `client.morpho.midnight(chainId).takeLend(...)` in app flows so the loan-token approval
 * and the `MidnightBundlesV2` authorization are resolved before building the bundle.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market traded by every takeable offer.
 * @param params.target - `{ type: "assets", assets, minUnits }` or `{ type: "units", units, maxBuyerAssets }`.
 * @param params.takeableOffers - ABI-ready borrow-side offers returned by the Midnight API.
 * @param params.maxContinuousFee - Largest market continuous fee accepted; pass `maxUint256` for no cap.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.referralFeePct - Optional WAD-scaled referral fee paid out of the pulled assets.
 * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightTakeLendAction>` targeting `MidnightBundlesV2`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when any offer is not borrow-side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when any offer belongs to another market.
 * @throws {NonPositiveInputError} when the target amount, `maxBuyerAssets` or `deadline` is not positive.
 * @throws {NegativeInputError} when `minUnits`, `maxContinuousFee` or `referralFeePct` is negative.
 * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256`.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightTakeLend } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightTakeLend({
 *   chainId: 8453,
 *   market: marketData.params,
 *   target: { type: "assets", assets: 1_000_000n, minUnits: 900_000n },
 *   takeableOffers: quote.data.takeableOffers,
 *   maxContinuousFee: maxUint256,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightTakeLend = (
  params: MidnightTakeLendParams,
): Readonly<Transaction<MidnightTakeLendAction>> => {
  const { marketId, referralFeePct, referralFeeRecipient } =
    validateParams(params);
  const { target } = params;
  const market = MarketUtils.toStruct(params.market);
  const args = [
    false, // reduceOnly
    false, // repayEnabled
    params.takeableOffers, // offerFills
    [], // collateralWithdrawals
    zeroAddress, // collateralReceiver
    referralFeePct, // referralFeePct
    referralFeeRecipient, // referralFeeRecipient
    params.maxContinuousFee, // maxContinuousFee
    params.deadline, // deadline
    zeroAddress, // wrappedNative
  ] as const;

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: 0n,
    data:
      target.type === "assets"
        ? encodeFunctionData({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
            args: [market, target.assets, target.minUnits, ...args],
          })
        : encodeFunctionData({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
            args: [market, target.units, target.maxBuyerAssets, ...args],
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
        target: { ...params.target },
        takeableOffers: params.takeableOffers.length,
        maxContinuousFee: params.maxContinuousFee,
        deadline: params.deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    },
  });
};
