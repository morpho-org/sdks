import type { Hex } from "viem";

/** `MidnightBundlesV2` group cancellation: marks `group` fully consumed if its consumption is at most `maxConsumed`. */
export interface GroupCancellation {
  /** Offer group id. */
  readonly group: Hex;
  /** Largest current group consumption accepted (uint128); the whole call reverts above it. */
  readonly maxConsumed: bigint;
}

/** `MidnightBundlesV2` collateral transfer: `assets` of the market collateral at `collateralIndex`. */
export interface CollateralTransfer {
  /** Index of the collateral in the market's `collateralParams`. */
  readonly collateralIndex: bigint;
  /** Collateral assets. */
  readonly assets: bigint;
}
