import { MarketUtils, midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  encodeFunctionData,
  isAddressEqual,
  maxUint256,
  zeroAddress,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  validateDeadline,
  validateMidnightNativeAmount,
  validateReferralFee,
  validateUint256Field,
} from "../../helpers/validate.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateTakeableOffers } from "../../helpers/validateTakeableOffers.js";
import {
  EmptyMidnightCollateralSuppliesError,
  type MidnightCollateralTransfer,
  type MidnightSupplyCollateralTakeBorrowAction,
  MidnightZeroReceiverError,
  NonPositiveInputError,
  type Transaction,
  UnboundedMidnightTakeInputError,
} from "../../types/index.js";
import type { MidnightTakeBorrowParams } from "./takeBorrow.js";

/** Parameters for encoding a collateral supply followed by a Midnight borrow take. */
export interface MidnightSupplyCollateralTakeBorrowParams
  extends MidnightTakeBorrowParams {
  /** Collateral pulled from `msg.sender` and supplied before taking offers; must not be empty. */
  readonly collateralSupplies: readonly MidnightCollateralTransfer[];
  /**
   * Optional native ETH sent as `value`; the bundle wraps it into the chain's wNative and transfers
   * it to `msg.sender` before pulling. It may cover part or all of the maximum wNative amount this
   * call can pull, but not more. Any wrapped native not pulled stays in the sender's wallet as
   * wNative. The wNative approval to `MidnightBundlesV2` is still required for the full pulled amount.
   */
  readonly nativeAmount?: bigint;
}

/**
 * Encodes a `MidnightBundlesV2` sell that supplies collateral and borrows from lend-side offers
 * for `msg.sender` in one call.
 *
 * Like `midnightTakeBorrow`, the sender's existing credit is withdrawn before offers are taken.
 * Prefer `client.morpho.midnight(chainId).supplyCollateralTakeBorrow(...)` in app flows so
 * collateral approvals and the `MidnightBundlesV2` authorization are resolved first.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market traded by every takeable offer.
 * @param params.target - `{ type: "assets", assets, maxUnits }` or `{ type: "units", units, minSellerAssets }`.
 * @param params.receiver - Recipient of the borrowed loan assets.
 * @param params.collateralSupplies - Collateral index and assets per supply; must not be empty.
 * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
 *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of the
 *   maximum wNative amount this call can pull, but not more. Any wrapped native not pulled stays in
 *   the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still required
 *   for the full pulled amount.
 * @param params.takeableOffers - ABI-ready lend-side offers returned by the Midnight API.
 * @param params.deadline - Bounded bundle execution deadline timestamp.
 * @param params.referralFeePct - Optional WAD-scaled referral fee taken from the received assets.
 * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightSupplyCollateralTakeBorrowAction>` targeting `MidnightBundlesV2`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {EmptyMidnightCollateralSuppliesError} when no collateral supply is provided.
 * @throws {UnknownCollateralIndexError} when a collateral index is not configured on the market.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when any offer is not lend-side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when any offer belongs to another market.
 * @throws {NonPositiveInputError} when a supply amount, the target amount, `maxUnits`, `minSellerAssets` or `deadline` is not positive.
 * @throws {NegativeInputError} when `referralFeePct` or `nativeAmount` is negative.
 * @throws {InputExceedsMaxError} when a `collateralSupplies[].assets` amount, `target.assets`,
 *   `target.maxUnits`, `target.units`, `target.minSellerAssets` or `deadline` exceeds `uint256`, or
 *   `nativeAmount` exceeds the maximum wNative collateral amount this call can pull.
 * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
 * @throws {NativeAmountOnNonWNativeAssetError} when no collateral pull uses wNative.
 * @throws {UnboundedMidnightTakeInputError} when `target.units`, `target.maxUnits` or
 *   `deadline` is `maxUint256`.
 * @throws {MidnightZeroReceiverError} when `receiver` is the zero address.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
 * @example
 * ```ts
 * import { Time } from "@morpho-org/morpho-ts";
 * import { midnightSupplyCollateralTakeBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightSupplyCollateralTakeBorrow({
 *   chainId: 8453,
 *   market: marketData.params,
 *   target: { type: "assets", assets: 1_000_000n, maxUnits: 1_100_000n },
 *   receiver: borrower,
 *   collateralSupplies: [{ collateralIndex: 0n, assets: 2_000_000n }],
 *   takeableOffers: quote.data.takeableOffers,
 *   deadline: Time.timestamp() + 600n,
 * });
 * ```
 */
export const midnightSupplyCollateralTakeBorrow = (
  params: MidnightSupplyCollateralTakeBorrowParams,
): Readonly<Transaction<MidnightSupplyCollateralTakeBorrowAction>> => {
  // Reject markets from another chain deployment before checking offers against them.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  if (params.collateralSupplies.length === 0) {
    throw new EmptyMidnightCollateralSuppliesError();
  }
  for (const [
    index,
    { collateralIndex, assets },
  ] of params.collateralSupplies.entries()) {
    if (assets <= 0n) {
      throw new NonPositiveInputError(
        `collateralSupplies[${index}].assets`,
        assets,
      );
    }
    validateUint256Field(`collateralSupplies[${index}].assets`, assets);
    // Throws UnknownCollateralIndexError when the index is not configured on the market.
    MarketUtils.getCollateralByIndex(params.market, collateralIndex);
  }
  const marketId = validateTakeableOffers({
    market: params.market,
    takeableOffers: params.takeableOffers,
    expectedBuy: true,
  });

  if (isAddressEqual(params.receiver, zeroAddress)) {
    throw new MidnightZeroReceiverError("receiver");
  }

  const { target } = params;
  if (target.type === "assets") {
    if (target.assets <= 0n) {
      throw new NonPositiveInputError("target.assets", target.assets);
    }
    if (target.maxUnits === maxUint256) {
      throw new UnboundedMidnightTakeInputError("target.maxUnits");
    }
    if (target.maxUnits <= 0n) {
      throw new NonPositiveInputError("target.maxUnits", target.maxUnits);
    }
    validateUint256Field("target.assets", target.assets);
    validateUint256Field("target.maxUnits", target.maxUnits);
  } else {
    if (target.units === maxUint256) {
      throw new UnboundedMidnightTakeInputError("target.units");
    }
    if (target.units <= 0n) {
      throw new NonPositiveInputError("target.units", target.units);
    }
    if (target.minSellerAssets <= 0n) {
      throw new NonPositiveInputError(
        "target.minSellerAssets",
        target.minSellerAssets,
      );
    }
    validateUint256Field("target.units", target.units);
    validateUint256Field("target.minSellerAssets", target.minSellerAssets);
  }
  if (params.deadline === maxUint256) {
    throw new UnboundedMidnightTakeInputError("deadline");
  }
  validateDeadline(params.deadline);
  const { referralFeePct, referralFeeRecipient } = validateReferralFee(params);
  const nativeFunding = validateMidnightNativeAmount({
    chainId: params.chainId,
    nativeAmount: params.nativeAmount,
    pulls: params.collateralSupplies.map(({ collateralIndex, assets }) => ({
      token: MarketUtils.getCollateralByIndex(params.market, collateralIndex)
        .token,
      assets,
    })),
  });
  const market = MarketUtils.toStruct(params.market);
  const args = [
    false, // reduceOnly
    params.receiver, // receiver
    params.collateralSupplies.map(({ collateralIndex, assets }) => ({
      collateralIndex,
      assets,
    })), // collateralSupplies
    params.takeableOffers, // offerFills
    referralFeePct, // referralFeePct
    referralFeeRecipient, // referralFeeRecipient
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
              "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
            args: [market, target.assets, target.maxUnits, ...args],
          })
        : encodeFunctionData({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
            args: [market, target.units, target.minSellerAssets, ...args],
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
        target: { ...params.target },
        receiver: params.receiver,
        collateralSupplies: params.collateralSupplies.map(
          ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
        ),
        takeableOffers: params.takeableOffers.length,
        deadline: params.deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    },
  });
};
