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
  type MidnightSellTarget,
  type MidnightTakeBorrowAction,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import type {
  MidnightReferralFeeParams,
  MidnightTakeableOffer,
} from "./types.js";

/** Parameters for encoding a Midnight borrow take from already selected offers. */
export interface MidnightTakeBorrowParams extends MidnightReferralFeeParams {
  readonly chainId: number;
  readonly market: MarketInput;
  /** Loan assets received with a unit cap, or units sold with a loan-asset floor. */
  readonly target: MidnightSellTarget;
  /** Recipient of the borrowed loan assets. */
  readonly receiver: Address;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

const validateParams = (params: MidnightTakeBorrowParams) => {
  // Reject markets from another chain deployment before checking offers against them.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
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
 * Encodes a `MidnightBundlesV2` sell that borrows from lend-side offers for `msg.sender`.
 *
 * `MidnightBundlesV2` first withdraws as much of the sender's existing credit as the target and
 * market liquidity allow, and fills only the rest from offers: a sender with credit nets it before
 * taking debt.
 *
 * Prefer `client.morpho.midnight(chainId).takeBorrow(...)` in app flows so the
 * `MidnightBundlesV2` authorization is resolved before building the bundle.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market traded by every takeable offer.
 * @param params.target - `{ type: "assets", assets, maxUnits }` or `{ type: "units", units, minSellerAssets }`.
 * @param params.receiver - Recipient of the borrowed loan assets.
 * @param params.takeableOffers - ABI-ready lend-side offers returned by the Midnight API.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.referralFeePct - Optional WAD-scaled referral fee taken from the received assets.
 * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightTakeBorrowAction>` targeting `MidnightBundlesV2`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when any offer is not lend-side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when any offer belongs to another market.
 * @throws {NonPositiveInputError} when the target amount, `maxUnits` or `deadline` is not positive.
 * @throws {NegativeInputError} when `minSellerAssets` or `referralFeePct` is negative.
 * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256`.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightTakeBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightTakeBorrow({
 *   chainId: 8453,
 *   market: marketData.params,
 *   target: { type: "assets", assets: 1_000_000n, maxUnits: 1_100_000n },
 *   receiver: borrower,
 *   takeableOffers: quote.data.takeableOffers,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightTakeBorrow = (
  params: MidnightTakeBorrowParams,
): Readonly<Transaction<MidnightTakeBorrowAction>> => {
  const { marketId, referralFeePct, referralFeeRecipient } =
    validateParams(params);
  const { target } = params;
  const market = MarketUtils.toStruct(params.market);
  const args = [
    false, // reduceOnly
    params.receiver, // receiver
    [], // collateralSupplies
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
      type: "midnightTakeBorrow",
      args: {
        market: marketId,
        target: { ...params.target },
        receiver: params.receiver,
        takeableOffers: params.takeableOffers.length,
        deadline: params.deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    },
  });
};
