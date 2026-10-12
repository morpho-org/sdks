import type { OfferStruct } from "@morpho-org/midnight-sdk";
import type { Address, Hex } from "viem";

/**
 * ABI-ready Midnight takeable offer returned by quote/takeable-offer APIs.
 *
 * Pass these objects unchanged into `takeLend`, `takeBorrow`, or
 * `supplyCollateralTakeBorrow`; the action builders validate side and market
 * consistency before encoding the bundle.
 */
export interface MidnightTakeableOffer {
  readonly units: bigint;
  readonly offer: OfferStruct;
  readonly ratifierData: Hex;
}

/** Optional referral fee shared by the Midnight taker builders. */
export interface MidnightReferralFeeParams {
  /** WAD-scaled share of the filled loan assets paid to `referralFeeRecipient`. Defaults to `0n`. */
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
}
