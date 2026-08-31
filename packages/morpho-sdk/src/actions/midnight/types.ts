import type { OfferStruct } from "@morpho-org/midnight-sdk";
import type { Hex } from "viem";

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

/** Protocol-shaped collateral supply used by Midnight bundle calls. */
export interface MidnightCollateralSupply {
  readonly collateralIndex: bigint;
  readonly assets: bigint;
  readonly permit: MidnightTokenPermit;
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
