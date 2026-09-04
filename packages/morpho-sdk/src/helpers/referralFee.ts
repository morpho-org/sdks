import { MathLib } from "@morpho-org/blue-sdk";
import {
  NegativeInputError,
  ReferralFeePctExceededError,
} from "../types/index.js";

/**
 * Computes the gross amount whose post-referral-fee proceeds equal `netAssets` exactly.
 *
 * @param params - Net target and WAD-scaled referral fee.
 * @returns The gross asset amount to pass to a bundles entrypoint.
 * @throws {NegativeInputError} when `netAssets` or `referralFeePct` is negative.
 * @throws {ReferralFeePctExceededError} when `referralFeePct >= WAD`.
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
  return MathLib.mulDivDown(
    params.netAssets,
    MathLib.WAD,
    MathLib.WAD - params.referralFeePct,
  );
};
