import type { OfferStruct } from "@morpho-org/midnight-sdk";
import type { Hex } from "viem";

/** Protocol-shaped collateral supply used by Midnight bundle calls. */
export interface MidnightCollateralSupply {
  readonly collateralIndex: bigint;
  readonly assets: bigint;
  readonly permit: {
    readonly kind: 0;
    readonly data: "0x";
  };
}

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
