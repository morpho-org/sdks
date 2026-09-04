import { MathLib } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import {
  InputExceedsMaxError,
  NegativeInputError,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveInputError,
  ReferralFeePctExceededError,
} from "./error.js";

describe("NegativeInputError", () => {
  test("default", () => {
    const error = new NegativeInputError("nativeAmount", -1n);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("NegativeInputError");
    expect(error.field).toBe("nativeAmount");
    expect(error.value).toBe(-1n);
    expect(error.message).toBe(
      'Input "nativeAmount" must be non-negative, got "-1".',
    );
  });
});

describe("NonPositiveInputError", () => {
  test("default", () => {
    const error = new NonPositiveInputError("assets", 0n);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("NonPositiveInputError");
    expect(error.field).toBe("assets");
    expect(error.value).toBe(0n);
    expect(error.message).toBe('Input "assets" must be positive, got "0".');
  });
});

describe("deprecated scalar input error aliases", () => {
  test("behavior: aliases preserve canonical constructor identity", () => {
    expect(NegativeNativeAmountError).toBe(NegativeInputError);
    expect(NonPositiveAssetAmountError).toBe(NonPositiveInputError);
    expect(new NegativeInputError("nativeAmount", -1n)).toBeInstanceOf(
      NegativeNativeAmountError,
    );
    expect(new NonPositiveInputError("assets", 0n)).toBeInstanceOf(
      NonPositiveAssetAmountError,
    );
  });
});

describe("ReferralFeePctExceededError", () => {
  test("default", () => {
    const error = new ReferralFeePctExceededError(MathLib.WAD);

    expect(error.name).toBe("ReferralFeePctExceededError");
    expect(error.referralFeePct).toBe(MathLib.WAD);
    expect(error.message).toBe(
      'Referral fee percentage "1000000000000000000" must be below WAD. Reduce referralFeePct or disable the referral fee.',
    );
  });

  test("behavior: stays catchable as the generic maximum-bound error", () => {
    const error = new ReferralFeePctExceededError(MathLib.WAD);

    expect(error).toBeInstanceOf(InputExceedsMaxError);
    expect(error.field).toBe("referralFeePct");
    expect(error.value).toBe(MathLib.WAD);
    expect(error.max).toBe(MathLib.WAD - 1n);
  });
});
