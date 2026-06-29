import type { OfferStruct } from "@morpho-org/midnight-sdk";
import type { Hex } from "viem";

/**
 * Token permit mode accepted by Midnight Bundles when pulling loan or collateral tokens.
 *
 * Mirrors the Solidity `PermitKind` enum in `IMidnightBundles`.
 */
export enum PermitKind {
  /** Use an existing ERC-20 allowance; `data` is ignored and should be empty bytes. */
  None = 0,
  /** Use an ERC-2612 permit payload encoded as `(uint256 deadline, uint8 v, bytes32 r, bytes32 s)`. */
  ERC2612 = 1,
  /** Use a Permit2 SignatureTransfer payload encoded as `(uint256 nonce, uint256 deadline, bytes signature)`. */
  Permit2 = 2,
}

/** Token permit payload passed to Midnight Bundles token-pull helpers. */
export type MidnightTokenPermit =
  | {
      readonly kind: PermitKind.None;
      readonly data: "0x";
    }
  | {
      readonly kind: PermitKind.ERC2612 | PermitKind.Permit2;
      readonly data: Hex;
    };

/** Protocol-shaped collateral withdrawal used by Midnight bundle calls. */
export interface MidnightCollateralWithdrawal {
  readonly collateralIndex: bigint;
  readonly assets: bigint;
}

/** Protocol-shaped collateral supply used by Midnight bundle calls. */
export interface MidnightCollateralSupply {
  readonly collateralIndex: bigint;
  readonly assets: bigint;
  readonly permit: MidnightTokenPermit;
}

/** ABI-ready Midnight take struct used by direct and bundled take flows. */
export interface MidnightTake {
  readonly units: bigint;
  readonly offer: OfferStruct;
  readonly ratifierData: Hex;
}
