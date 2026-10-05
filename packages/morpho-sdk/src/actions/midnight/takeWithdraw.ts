import type { MarketInput } from "@morpho-org/midnight-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateTakeableOffers } from "../../helpers/validateTakeableOffers.js";
import type {
  Metadata,
  MidnightSellTarget,
  MidnightTakeWithdrawAction,
  Transaction,
} from "../../types/index.js";
import {
  type MidnightReferralFeeParams,
  midnightBundlesV2Sell,
} from "./bundlesV2Take.js";
import type { MidnightTakeableOffer } from "./types.js";

/** Parameters for encoding a Midnight credit withdrawal that redeems first, then sells to offers. */
export interface MidnightTakeWithdrawParams extends MidnightReferralFeeParams {
  readonly chainId: number;
  readonly market: MarketInput;
  /** Loan assets received with a credit-unit cap, or credit units sold with a loan-asset floor. */
  readonly target: MidnightSellTarget;
  /** Recipient of the withdrawn loan assets. */
  readonly receiver: Address;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

/**
 * Encodes a reduce-only `MidnightBundlesV2` sell that withdraws `msg.sender`'s credit.
 *
 * `MidnightBundlesV2` first redeems as much credit as the target and market liquidity allow, then
 * sells the rest of the target to lend-side offers. `reduceOnly` is always set, so the sell fails
 * instead of opening debt when the sender's credit does not cover the target.
 *
 * Prefer `client.morpho.midnight(chainId).takeWithdraw(...)` in app flows so the
 * `MidnightBundlesV2` authorization is resolved before building the bundle.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market traded by every takeable offer.
 * @param params.target - `{ type: "assets", assets, maxUnits }` or `{ type: "units", units, minSellerAssets }`.
 * @param params.receiver - Recipient of the withdrawn loan assets.
 * @param params.takeableOffers - ABI-ready lend-side offers returned by the Midnight API.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.referralFeePct - Optional WAD-scaled referral fee taken from the received assets.
 * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightTakeWithdrawAction>` targeting `MidnightBundlesV2`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when any offer is not lend-side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when any offer belongs to another market.
 * @throws {NonPositiveInputError} when the target amount, `maxUnits` or `deadline` is not positive.
 * @throws {NegativeInputError} when `minSellerAssets` is negative.
 * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256`.
 * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightTakeWithdraw } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightTakeWithdraw({
 *   chainId: 8453,
 *   market: marketData.params,
 *   target: { type: "units", units: credit, minSellerAssets: 990_000n },
 *   receiver: lender,
 *   takeableOffers: quote.data.takeableOffers,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightTakeWithdraw = (
  params: MidnightTakeWithdrawParams,
): Readonly<Transaction<MidnightTakeWithdrawAction>> => {
  // Reject markets from another chain deployment before checking offers against them.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = validateTakeableOffers({
    market: params.market,
    takeableOffers: params.takeableOffers,
    expectedBuy: true,
  });

  let tx = midnightBundlesV2Sell({
    ...params,
    reduceOnly: true,
    offerFills: params.takeableOffers,
    collateralSupplies: [],
  });
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightTakeWithdraw",
      args: {
        market: marketId,
        target: { ...params.target },
        receiver: params.receiver,
        takeableOffers: params.takeableOffers.length,
        deadline: params.deadline,
      },
    },
  });
};
