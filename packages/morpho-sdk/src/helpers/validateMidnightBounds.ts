import type { OfferStruct } from "@morpho-org/midnight-sdk";
import { maxUint128 } from "viem";
import {
  InputExceedsMaxError,
  MidnightReferralFeePctExceededError,
  NegativeInputError,
} from "../types/error.js";
import { MIDNIGHT_MAX_REFERRAL_FEE_PCT } from "./constant.js";

/**
 * Validates an integer stored by Midnight as `uint128`.
 *
 * @param field - Input field name used in validation errors.
 * @param value - Candidate bigint.
 * @returns Nothing when `value` is within the unsigned 128-bit range.
 * @throws {NegativeInputError} when `value` is negative.
 * @throws {InputExceedsMaxError} when `value` exceeds `maxUint128`.
 * @internal
 */
export const validateMidnightUint128Field = (
  field: string,
  value: bigint,
): void => {
  if (value < 0n) throw new NegativeInputError(field, value);
  if (value > maxUint128) {
    throw new InputExceedsMaxError({ field, value, max: maxUint128 });
  }
};

/**
 * Enforces the SDK's 10% (`WAD / 10n`) Midnight referral-fee cap. The contract
 * itself only requires `referralFeePct < WAD`.
 *
 * @param referralFeePct - Candidate referral fee percentage.
 * @returns Nothing when the fee is within the SDK cap.
 * @throws {MidnightReferralFeePctExceededError} when the fee exceeds the SDK cap.
 * @internal
 */
export const validateMidnightReferralFeeCap = (
  referralFeePct: bigint,
): void => {
  if (referralFeePct > MIDNIGHT_MAX_REFERRAL_FEE_PCT) {
    throw new MidnightReferralFeePctExceededError(referralFeePct);
  }
};

/**
 * Enforces the uint128 collateral-supply total for each collateral index.
 *
 * @param field - Input array name used in validation errors.
 * @param supplies - Transfers grouped by collateral index.
 * @returns Nothing when every per-key sum is at most `maxUint128`.
 * @throws {InputExceedsMaxError} when a per-key sum exceeds `maxUint128`.
 * @internal
 */
export const validateMidnightCollateralSupplySums = (
  field: string,
  supplies: readonly {
    readonly collateralIndex: bigint;
    readonly assets: bigint;
  }[],
): void => {
  const sums = new Map<bigint, bigint>();
  for (const { collateralIndex, assets } of supplies) {
    const sum = (sums.get(collateralIndex) ?? 0n) + assets;
    if (sum > maxUint128) {
      throw new InputExceedsMaxError({
        field: `${field}(collateralIndex=${collateralIndex})`,
        value: sum,
        max: maxUint128,
      });
    }
    sums.set(collateralIndex, sum);
  }
};

/**
 * Enforces uint128 limits on each offer's `maxUnits` and `maxAssets`.
 *
 * @param takeableOffers - Offers selected for a Midnight take.
 * @returns Nothing when every offer cap is in the unsigned 128-bit range.
 * @throws {NegativeInputError} when an offer cap is negative.
 * @throws {InputExceedsMaxError} when an offer cap exceeds `maxUint128`.
 * @internal
 */
export const validateMidnightTakeableOfferBounds = (
  takeableOffers: readonly {
    readonly offer: Pick<OfferStruct, "maxUnits" | "maxAssets">;
  }[],
): void => {
  for (const [index, { offer }] of takeableOffers.entries()) {
    validateMidnightUint128Field(
      `takeableOffers[${index}].offer.maxUnits`,
      offer.maxUnits,
    );
    validateMidnightUint128Field(
      `takeableOffers[${index}].offer.maxAssets`,
      offer.maxAssets,
    );
  }
};
