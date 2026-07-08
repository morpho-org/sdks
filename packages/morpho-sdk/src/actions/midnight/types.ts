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

/** ABI-ready Midnight takeable offer used by direct and bundled take flows. */
export interface MidnightTakeableOffer {
  readonly units: bigint;
  readonly offer: OfferStruct;
  readonly ratifierData: Hex;
}
