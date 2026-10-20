import { maxUint128, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  InputExceedsMaxError,
  MidnightReferralFeePctExceededError,
  NegativeInputError,
} from "../types/index.js";
import { MIDNIGHT_MAX_REFERRAL_FEE_PCT } from "./constant.js";
import {
  validateMidnightCollateralSupplySums,
  validateMidnightReferralFeeCap,
  validateMidnightTakeableOfferBounds,
  validateMidnightUint128Field,
} from "./validateMidnightBounds.js";

describe("validateMidnightUint128Field", () => {
  test("accepts the uint128 boundary", () => {
    expect(() =>
      validateMidnightUint128Field("assets", maxUint128),
    ).not.toThrow();
  });

  test("rejects negative and oversized values", () => {
    expect(() => validateMidnightUint128Field("assets", -1n)).toThrow(
      NegativeInputError,
    );
    for (const value of [maxUint128 + 1n, maxUint256 + 1n]) {
      let error: unknown;
      try {
        validateMidnightUint128Field("assets", value);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(InputExceedsMaxError);
      expect(error).toMatchObject({ field: "assets", value, max: maxUint128 });
    }
  });
});

describe("validateMidnightReferralFeeCap", () => {
  test("accepts the cap and rejects larger fees with the typed error", () => {
    expect(() =>
      validateMidnightReferralFeeCap(MIDNIGHT_MAX_REFERRAL_FEE_PCT),
    ).not.toThrow();
    expect(() =>
      validateMidnightReferralFeeCap(MIDNIGHT_MAX_REFERRAL_FEE_PCT + 1n),
    ).toThrow(MidnightReferralFeePctExceededError);
  });
});

describe("validateMidnightCollateralSupplySums", () => {
  test("checks sums independently by collateral key", () => {
    expect(() =>
      validateMidnightCollateralSupplySums("collateralSupplies", [
        { collateralIndex: 0n, assets: maxUint128 },
        { collateralIndex: 1n, assets: maxUint128 },
      ]),
    ).not.toThrow();
    expect(() =>
      validateMidnightCollateralSupplySums("collateralSupplies", [
        { collateralIndex: 0n, assets: maxUint128 - 1n },
        { collateralIndex: 0n, assets: 1n },
      ]),
    ).not.toThrow();
    let error: unknown;
    try {
      validateMidnightCollateralSupplySums("collateralSupplies", [
        { collateralIndex: 0n, assets: maxUint128 },
        { collateralIndex: 0n, assets: 1n },
      ]);
    } catch (reason) {
      error = reason;
    }
    expect(error).toBeInstanceOf(InputExceedsMaxError);
    expect(error).toMatchObject({
      field: "collateralSupplies(collateralIndex=0)",
    });
  });
});

describe("validateMidnightTakeableOfferBounds", () => {
  test("accepts uint128 caps and rejects negative and oversized caps", () => {
    expect(() =>
      validateMidnightTakeableOfferBounds([
        { offer: { maxUnits: maxUint128, maxAssets: maxUint128 } },
      ]),
    ).not.toThrow();
    expect(() =>
      validateMidnightTakeableOfferBounds([
        { offer: { maxUnits: -1n, maxAssets: 0n } },
      ]),
    ).toThrow(NegativeInputError);
    expect(() =>
      validateMidnightTakeableOfferBounds([
        { offer: { maxUnits: 0n, maxAssets: maxUint128 + 1n } },
      ]),
    ).toThrow(InputExceedsMaxError);
  });
});
