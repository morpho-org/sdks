import {
  type MarketInput,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, zeroAddress } from "viem";
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
  type MidnightCollateralTransfer,
  type MidnightTakeRepayWithdrawCollateralAction,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import type {
  MidnightReferralFeeParams,
  MidnightTakeableOffer,
} from "./types.js";

/** Parameters for encoding a Midnight debt repayment through offers, then collateral withdrawals. */
export interface MidnightTakeRepayWithdrawCollateralParams
  extends MidnightReferralFeeParams {
  readonly chainId: number;
  readonly market: MarketInput;
  /** Loan assets paid with a unit floor, or debt units repaid with a loan-asset cap. */
  readonly target: MidnightBuyTarget;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  /** Repays the rest of the target directly to Midnight when offers do not fill it. */
  readonly repayEnabled: boolean;
  /** Collateral withdrawn after repaying; `maxUint256` assets withdraws the whole balance. */
  readonly collateralWithdrawals: readonly MidnightCollateralTransfer[];
  readonly collateralReceiver: Address;
  /** Largest market continuous fee accepted when taking offers. Pass `maxUint256` explicitly for no cap. */
  readonly maxContinuousFee: bigint;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

const validateParams = (params: MidnightTakeRepayWithdrawCollateralParams) => {
  if (params.target.type === "assets" && params.target.assets <= 0n) {
    throw new NonPositiveInputError("target.assets", params.target.assets);
  }
  // Reject markets from another chain deployment before checking offers against them.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  for (const [
    index,
    { collateralIndex, assets },
  ] of params.collateralWithdrawals.entries()) {
    if (assets <= 0n) {
      throw new NonPositiveInputError(
        `collateralWithdrawals[${index}].assets`,
        assets,
      );
    }
    // Throws UnknownCollateralIndexError when the index is not configured on the market.
    MarketUtils.getCollateralByIndex(params.market, collateralIndex);
  }
  const marketId = validateTakeableOffers({
    market: params.market,
    takeableOffers: params.takeableOffers,
    expectedBuy: false,
  });

  const { target } = params;
  if (target.type === "assets") {
    if (target.assets < 0n) {
      throw new NegativeInputError("target.assets", target.assets);
    }
    if (target.minUnits < 0n) {
      throw new NegativeInputError("target.minUnits", target.minUnits);
    }
  } else {
    if (target.units <= 0n) {
      throw new NonPositiveInputError("target.units", target.units);
    }
    if (target.maxBuyerAssets < 0n) {
      throw new NegativeInputError(
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
 * Encodes a `MidnightBundlesV2` reduce-only buy that repays `msg.sender`'s debt by taking
 * borrow-side offers, optionally repays the remainder directly, then withdraws collateral.
 *
 * `reduceOnly` is always set, so the buy never opens a lender position. Prefer
 * `client.morpho.midnight(chainId).takeRepayWithdrawCollateral(...)` in app flows so the
 * loan-token approval and the `MidnightBundlesV2` authorization are resolved first.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market traded by every takeable offer.
 * @param params.target - `{ type: "assets", assets, minUnits }` or `{ type: "units", units, maxBuyerAssets }`.
 * @param params.takeableOffers - ABI-ready borrow-side offers returned by the Midnight API; must not be empty.
 * @param params.repayEnabled - Whether the unfilled remainder is repaid directly to Midnight.
 * @param params.collateralWithdrawals - Collateral index and assets per withdrawal; may be empty.
 * @param params.collateralReceiver - Recipient of withdrawn collateral.
 * @param params.maxContinuousFee - Largest market continuous fee accepted; pass `maxUint256` for no cap.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.referralFeePct - Optional WAD-scaled referral fee paid out of the pulled assets.
 * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightTakeRepayWithdrawCollateralAction>` targeting `MidnightBundlesV2`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when any offer is not borrow-side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when any offer belongs to another market.
 * @throws {UnknownCollateralIndexError} when a withdrawal targets a collateral index not configured on the market.
 * @throws {NonPositiveInputError} when the target amount, a withdrawal amount or `deadline` is not positive.
 * @throws {NegativeInputError} when the target bound or `maxContinuousFee` is negative.
 * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256`.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightTakeRepayWithdrawCollateral } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightTakeRepayWithdrawCollateral({
 *   chainId: 8453,
 *   market: marketData.params,
 *   target: { type: "units", units: 1_000_000n, maxBuyerAssets: 990_000n },
 *   takeableOffers: quote.data.takeableOffers,
 *   repayEnabled: true,
 *   collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
 *   collateralReceiver: borrower,
 *   maxContinuousFee: maxUint256,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightTakeRepayWithdrawCollateral = (
  params: MidnightTakeRepayWithdrawCollateralParams,
): Readonly<Transaction<MidnightTakeRepayWithdrawCollateralAction>> => {
  const { marketId, referralFeePct, referralFeeRecipient } =
    validateParams(params);
  const { target } = params;
  const market = MarketUtils.toStruct(params.market);
  const args = [
    true, // reduceOnly
    params.repayEnabled, // repayEnabled
    params.takeableOffers, // offerFills
    params.collateralWithdrawals.map(({ collateralIndex, assets }) => ({
      collateralIndex,
      assets,
    })), // collateralWithdrawals
    params.collateralReceiver, // collateralReceiver
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
      type: "midnightTakeRepayWithdrawCollateral",
      args: {
        market: marketId,
        target: { ...params.target },
        repayEnabled: params.repayEnabled,
        collateralWithdrawals: params.collateralWithdrawals.map(
          ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
        ),
        collateralReceiver: params.collateralReceiver,
        takeableOffers: params.takeableOffers.length,
        maxContinuousFee: params.maxContinuousFee,
        deadline: params.deadline,
      },
    },
  });
};
