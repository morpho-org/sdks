import { MathLib } from "@morpho-org/blue-sdk";
import {
  NegativeInputError,
  ReferralFeePctExceededError,
} from "../types/index.js";
import { validateMidnightReferralFeeCap } from "./validateMidnightBounds.js";

/**
 * Computes the gross amount whose post-referral-fee proceeds equal `netAssets` exactly.
 *
 * @param params - Net target and WAD-scaled referral fee.
 * @param params.netAssets - Required proceeds after the fee, in the asset's smallest unit.
 * @param params.referralFeePct - Referral fee fraction scaled by WAD (`1e18`); at most 10%.
 * @returns The gross asset amount to pass to a bundles entrypoint.
 * @throws {NegativeInputError} when `netAssets` or `referralFeePct` is negative.
 * @throws {ReferralFeePctExceededError} when `referralFeePct >= WAD`.
 * @throws {MidnightReferralFeePctExceededError} when the fee is above 10% but below WAD.
 * @example
 * ```ts
 * import { grossFromNetAssets } from "@morpho-org/morpho-sdk";
 *
 * const gross = grossFromNetAssets({ netAssets: 990n, referralFeePct: 10_000000000000000n });
 * // gross satisfies bigint
 * ```
 */
export const grossFromNetAssets = (params: {
  readonly netAssets: bigint;
  readonly referralFeePct: bigint;
}): bigint => {
  if (params.netAssets < 0n) {
    throw new NegativeInputError("netAssets", params.netAssets);
  }
  if (params.referralFeePct < 0n) {
    throw new NegativeInputError("referralFeePct", params.referralFeePct);
  }
  if (params.referralFeePct >= MathLib.WAD) {
    throw new ReferralFeePctExceededError(params.referralFeePct);
  }
  // Reject fees that the SDK's bundle builders would reject.
  validateMidnightReferralFeeCap(params.referralFeePct);
  return MathLib.mulDivDown(
    params.netAssets,
    MathLib.WAD,
    MathLib.WAD - params.referralFeePct,
  );
};
