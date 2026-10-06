import type { OfferStruct } from "@morpho-org/midnight-sdk";
import type { Address, Hex } from "viem";

/**
 * MidnightBundles token permit selector.
 *
 * The first Midnight action implementation only emits `None`; `ERC2612` and
 * `Permit2` are reserved for future token-signature bundle support.
 */
export enum PermitKind {
  None = 0,
  ERC2612 = 1,
  Permit2 = 2,
}

/** ABI-ready token permit metadata consumed by MidnightBundles. */
export type MidnightTokenPermit =
  | {
      readonly kind: PermitKind.None;
      readonly data: "0x";
    }
  | {
      readonly kind: PermitKind.ERC2612 | PermitKind.Permit2;
      readonly data: Hex;
    };

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
