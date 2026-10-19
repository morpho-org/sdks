import {
  type MarketInput,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { encodeFunctionData, maxUint256, zeroAddress } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  validateDeadline,
  validateMidnightNativeAmount,
  validateReferralFee,
  validateUint256Field,
} from "../../helpers/validate.js";
import {
  validateMidnightReferralFeeCap,
  validateMidnightTakeableOfferBounds,
  validateMidnightUint128Field,
} from "../../helpers/validateMidnightBounds.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateMidnightReceiver } from "../../helpers/validateMidnightReceiver.js";
import { validateTakeableOffers } from "../../helpers/validateTakeableOffers.js";
import {
  type Metadata,
  type MidnightBuyTarget,
  type MidnightTakeLendAction,
  NonPositiveInputError,
  type Transaction,
  UnboundedMidnightTakeInputError,
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
  /**
   * Optional native ETH sent as `value`; the bundle wraps it into the chain's wNative and transfers
   * it to `msg.sender` before pulling. It may cover part or all of the maximum wNative amount this
   * call can pull, but not more. Any wrapped native not pulled stays in the sender's wallet as
   * wNative. The wNative approval to `MidnightBundlesV2` is still required for the full pulled amount.
   */
  readonly nativeAmount?: bigint;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  /** Largest market continuous fee accepted when taking offers. Pass `maxUint256` explicitly for no cap. */
  readonly maxContinuousFee: bigint;
  /** Bounded bundle execution deadline timestamp. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

/**
 * Encodes a `MidnightBundlesV2` buy that lends into borrow-side offers for `msg.sender`.
 *
 * Prefer `client.morpho.midnight(chainId).takeLend(...)` in app flows so the loan-token approval
 * and the `MidnightBundlesV2` authorization are resolved before building the bundle.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market traded by every takeable offer.
 * @param params.target - `{ type: "assets", assets, minUnits }` or `{ type: "units", units, maxBuyerAssets }`.
 * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
 *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of the
 *   maximum wNative amount this call can pull, but not more. Any wrapped native not pulled stays in
 *   the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still required
 *   for the full pulled amount.
 * @param params.takeableOffers - ABI-ready borrow-side offers returned by the Midnight API.
 * @param params.maxContinuousFee - Largest market continuous fee accepted, in the unit of the market's
 *   onchain `continuousFee` (`Market.continuousFee`): a WAD-scaled per-second rate, so `317097919n`
 *   is about 1% per year. The take reverts if the market fee is higher. Pass `maxUint256` for no cap.
 * @param params.deadline - Bounded bundle execution deadline timestamp. Not checked against the clock; validate freshness before building.
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
 * @throws {NonPositiveInputError} when the target amount, `minUnits`, `maxBuyerAssets` or `deadline` is not positive.
 * @throws {NegativeInputError} when a takeable offer cap, `maxContinuousFee`,
 *   `referralFeePct` or `nativeAmount` is negative.
 * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
 * @throws {NativeAmountOnNonWNativeAssetError} when `market.loanToken` is not wNative.
 * @throws {InputExceedsMaxError} when a target amount or offer cap exceeds `uint128`; when
 *   `target.maxBuyerAssets` exceeds `uint128` (an SDK cap: the bundle accepts `uint256`, but a
 *   higher ceiling gives no slippage protection); when `maxContinuousFee` or `deadline` exceeds
 *   `uint256`; or when `nativeAmount` exceeds the maximum wNative amount this call can pull.
 * @throws {UnboundedMidnightTakeInputError} when `target.units`, `target.maxBuyerAssets` or
 *   `deadline` is `maxUint256`.
 * @throws {MidnightContractReceiverError} when `referralFeeRecipient` is a Midnight protocol
 *   contract or a market token contract with a positive referral fee.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
 * @throws {MidnightReferralFeePctExceededError} when `referralFeePct` exceeds 10% (`WAD / 10n`).
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
 * @example
 * ```ts
 * import { Time } from "@morpho-org/morpho-ts";
 * import { maxUint256 } from "viem";
 * import { midnightTakeLend } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightTakeLend({
 *   chainId: 8453,
 *   market: marketData.params,
 *   target: { type: "assets", assets: 1_000_000n, minUnits: 900_000n },
 *   takeableOffers: quote.data.takeableOffers,
 *   maxContinuousFee: maxUint256,
 *   deadline: Time.timestamp() + 600n,
 * });
 * ```
 */
export const midnightTakeLend = (
  params: MidnightTakeLendParams,
): Readonly<Transaction<MidnightTakeLendAction>> => {
  // Reject markets from another chain deployment before checking offers against them.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = validateTakeableOffers({
    market: params.market,
    takeableOffers: params.takeableOffers,
    expectedBuy: false,
  });
  validateMidnightTakeableOfferBounds(params.takeableOffers);

  const { target } = params;
  if (target.type === "assets") {
    if (target.assets <= 0n) {
      throw new NonPositiveInputError("target.assets", target.assets);
    }
    if (target.minUnits <= 0n) {
      throw new NonPositiveInputError("target.minUnits", target.minUnits);
    }
    validateMidnightUint128Field("target.assets", target.assets);
    validateMidnightUint128Field("target.minUnits", target.minUnits);
  } else {
    if (target.units === maxUint256) {
      throw new UnboundedMidnightTakeInputError("target.units");
    }
    if (target.maxBuyerAssets === maxUint256) {
      throw new UnboundedMidnightTakeInputError("target.maxBuyerAssets");
    }
    if (target.units <= 0n) {
      throw new NonPositiveInputError("target.units", target.units);
    }
    if (target.maxBuyerAssets <= 0n) {
      throw new NonPositiveInputError(
        "target.maxBuyerAssets",
        target.maxBuyerAssets,
      );
    }
    validateMidnightUint128Field("target.units", target.units);
    validateMidnightUint128Field(
      "target.maxBuyerAssets",
      target.maxBuyerAssets,
    );
  }
  validateUint256Field("maxContinuousFee", params.maxContinuousFee);
  if (params.deadline === maxUint256) {
    throw new UnboundedMidnightTakeInputError("deadline");
  }
  validateDeadline(params.deadline);
  const { referralFeePct, referralFeeRecipient } = validateReferralFee(params);
  validateMidnightReferralFeeCap(referralFeePct);
  if (referralFeePct > 0n) {
    // Rejects fee recipients that would strand the fee in a contract.
    validateMidnightReceiver({
      chainId: params.chainId,
      market: params.market,
      field: "referralFeeRecipient",
      receiver: referralFeeRecipient,
    });
  }
  const market = MarketUtils.toStruct(params.market);
  const nativeFunding = validateMidnightNativeAmount({
    chainId: params.chainId,
    nativeAmount: params.nativeAmount,
    pulls: [
      {
        token: market.loanToken,
        assets:
          target.type === "assets" ? target.assets : target.maxBuyerAssets,
      },
    ],
  });
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
    nativeFunding.wrappedNative, // wrappedNative
  ] as const;

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: nativeFunding.value,
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
