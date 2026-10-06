import { MarketUtils, midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
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
  EmptyMidnightCollateralSuppliesError,
  type MidnightCollateralTransfer,
  type MidnightSupplyCollateralTakeBorrowAction,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import type { MidnightTakeBorrowParams } from "./takeBorrow.js";

/** Parameters for encoding a collateral supply followed by a Midnight borrow take. */
export interface MidnightSupplyCollateralTakeBorrowParams
  extends MidnightTakeBorrowParams {
  /** Collateral pulled from `msg.sender` and supplied before taking offers; must not be empty. */
  readonly collateralSupplies: readonly MidnightCollateralTransfer[];
}

const validateParams = (params: MidnightSupplyCollateralTakeBorrowParams) => {
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
    // Throws UnknownCollateralIndexError when the index is not configured on the market.
    MarketUtils.getCollateralByIndex(params.market, collateralIndex);
  }
  const marketId = validateTakeableOffers({
    market: params.market,
    takeableOffers: params.takeableOffers,
    expectedBuy: true,
  });

  const { target } = params;
  if (target.type === "assets") {
    if (target.assets <= 0n) {
      throw new NonPositiveInputError("target.assets", target.assets);
    }
    if (target.maxUnits <= 0n) {
      throw new NonPositiveInputError("target.maxUnits", target.maxUnits);
    }
  } else {
    if (target.units <= 0n) {
      throw new NonPositiveInputError("target.units", target.units);
    }
    if (target.minSellerAssets < 0n) {
      throw new NegativeInputError(
        "target.minSellerAssets",
        target.minSellerAssets,
      );
    }
  }
  validateDeadline(params.deadline);
  const { referralFeePct, referralFeeRecipient } = validateReferralFee(params);
  return { marketId, referralFeePct, referralFeeRecipient };
};

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
 * @param params.takeableOffers - ABI-ready lend-side offers returned by the Midnight API.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
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
 * @throws {NonPositiveInputError} when a supply amount, the target amount, `maxUnits` or `deadline` is not positive.
 * @throws {NegativeInputError} when `minSellerAssets` is negative.
 * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256`.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightSupplyCollateralTakeBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightSupplyCollateralTakeBorrow({
 *   chainId: 8453,
 *   market: marketData.params,
 *   target: { type: "assets", assets: 1_000_000n, maxUnits: 1_100_000n },
 *   receiver: borrower,
 *   collateralSupplies: [{ collateralIndex: 0n, assets: 2_000_000n }],
 *   takeableOffers: quote.data.takeableOffers,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightSupplyCollateralTakeBorrow = (
  params: MidnightSupplyCollateralTakeBorrowParams,
): Readonly<Transaction<MidnightSupplyCollateralTakeBorrowAction>> => {
  const { marketId, referralFeePct, referralFeeRecipient } =
    validateParams(params);
  const { target } = params;
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
