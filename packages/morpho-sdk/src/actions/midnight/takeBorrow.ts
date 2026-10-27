import {
  type MarketInput,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, maxUint256, zeroAddress } from "viem";
import { encodeMidnightCalldata } from "../../helpers/encodeMidnightCalldata.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  validateDeadline,
  validateReferralFee,
} from "../../helpers/validate.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import {
  validateMidnightReferralFeeCap,
  validateMidnightTakeableOfferBounds,
  validateMidnightUint128Field,
} from "../../helpers/validateMidnightBounds.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateMidnightReceiver } from "../../helpers/validateMidnightReceiver.js";
import { validateMidnightSellTargetBounds } from "../../helpers/validateMidnightTakeFeasibility.js";
import { validateTakeableOffers } from "../../helpers/validateTakeableOffers.js";
import {
  type Metadata,
  type MidnightSellTarget,
  type MidnightTakeBorrowAction,
  NonPositiveInputError,
  type Transaction,
  UnboundedMidnightTakeInputError,
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
  /** Bounded bundle execution deadline timestamp. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

/**
 * Encodes a `MidnightBundlesV2` sell that borrows from lend-side offers for `msg.sender`.
 *
 * `MidnightBundlesV2` first withdraws as much of the sender's existing credit as the target and
 * market liquidity allow, and fills only the rest from offers: a sender with credit nets it before
 * taking debt.
 *
 * This builder reads no position or prices, so it applies no `DEFAULT_LLTV_BUFFER` health check:
 * keeping the position inside the buffer is the caller's responsibility. The entity method checks
 * it from `positionData` and `collateralPrices`; onchain, Midnight still rejects a position above
 * LLTV.
 *
 * Prefer `client.morpho.midnight(chainId).takeBorrow(...)` in app flows so the
 * `MidnightBundlesV2` authorization is resolved before building the bundle.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market traded by every takeable offer.
 * @param params.target - `{ type: "assets", assets, maxUnits }` or `{ type: "units", units, minSellerAssets }`.
 * @param params.receiver - Recipient of the borrowed loan assets; Midnight protocol and market
 *   token contracts are rejected.
 * @param params.takeableOffers - ABI-ready lend-side offers returned by the Midnight API.
 * @param params.deadline - Bounded bundle execution deadline timestamp. Not checked against the clock; validate freshness before building.
 * @param params.referralFeePct - Optional WAD-scaled referral fee taken from the sale
 *   proceeds; on an assets target it is added on top of `target.assets`.
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
 * @throws {NonPositiveInputError} when the target amount, `maxUnits`, `minSellerAssets` or `deadline` is not positive.
 * @throws {NegativeInputError} when a takeable offer cap or `referralFeePct` is negative.
 * @throws {InputExceedsMaxError} when a target amount or offer cap exceeds `uint128`, when
 *   `target.maxUnits` exceeds `uint128` (an SDK cap: the bundle accepts `uint256`, but a higher
 *   ceiling gives no slippage protection), or when `deadline` exceeds `uint256`.
 * @throws {UnboundedMidnightTakeInputError} when `target.units`, `target.maxUnits` or
 *   `deadline` is `maxUint256`.
 * @throws {MidnightZeroReceiverError} when `receiver` is the zero address.
 * @throws {MidnightContractReceiverError} when `receiver` is a Midnight protocol contract or a
 *   market token contract, or when `referralFeeRecipient` is either with a positive referral fee.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
 * @throws {MidnightReferralFeePctExceededError} when `referralFeePct` exceeds 10% (`WAD / 10n`).
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
 * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32`, an out-of-range integer or a malformed address.
 * @throws {MidnightTakeTargetUnreachableError} when `target.minSellerAssets` exceeds `target.units`
 *   minus the referral fee, or `target.maxUnits` is below `target.assets` plus the referral fee, since
 *   a unit sells for at most one asset.
 * @example
 * ```ts
 * import { Time } from "@morpho-org/morpho-ts";
 * import { midnightTakeBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightTakeBorrow({
 *   chainId: 8453,
 *   market: marketData.params,
 *   target: { type: "assets", assets: 1_000_000n, maxUnits: 1_100_000n },
 *   receiver: borrower,
 *   takeableOffers: quote.data.takeableOffers,
 *   deadline: Time.timestamp() + 600n,
 * });
 * ```
 */
export const midnightTakeBorrow = (
  params: MidnightTakeBorrowParams,
): Readonly<Transaction<MidnightTakeBorrowAction>> => {
  // Reject markets from another chain deployment before checking offers against them.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = validateTakeableOffers({
    market: params.market,
    takeableOffers: params.takeableOffers,
    expectedBuy: true,
  });
  validateMidnightTakeableOfferBounds(params.takeableOffers);

  // Rejects receivers that would strand the borrowed assets in a contract.
  validateMidnightReceiver({
    chainId: params.chainId,
    market: params.market,
    field: "receiver",
    receiver: params.receiver,
  });

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
    validateMidnightUint128Field("target.assets", target.assets);
    validateMidnightUint128Field("target.maxUnits", target.maxUnits);
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
    validateMidnightUint128Field("target.units", target.units);
    validateMidnightUint128Field(
      "target.minSellerAssets",
      target.minSellerAssets,
    );
  }
  if (params.deadline === maxUint256) {
    throw new UnboundedMidnightTakeInputError("deadline");
  }
  validateDeadline(params.deadline);
  if (params.referralFeeRecipient !== undefined)
    validateMidnightAddress(
      "referralFeeRecipient",
      params.referralFeeRecipient,
    );
  const { referralFeePct, referralFeeRecipient } = validateReferralFee(params);
  validateMidnightReferralFeeCap(referralFeePct);
  validateMidnightSellTargetBounds({ target, referralFeePct });
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
        ? encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
            args: [market, target.assets, target.maxUnits, ...args],
          })
        : encodeMidnightCalldata({
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
