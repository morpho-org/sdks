import type { OfferStruct } from "@morpho-org/midnight-sdk";
import type { Hex } from "viem";

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
