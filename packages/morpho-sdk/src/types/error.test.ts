import { describe, expect, test } from "vitest";
import {
  BorrowAmountAndSharesExclusiveError,
  NegativeInputError,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveInputError,
  RefinanceExceedsBorrowAssetsError,
  RefinanceExceedsBorrowSharesError,
  RefinanceExceedsCollateralError,
  RefinanceSharesMissingBorrowAssetsError,
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

describe("deprecated refinance partial-migration error exports", () => {
  test("behavior: v5 partial-migration errors stay exported as Error subclasses", () => {
    // The BlueBundlesV1 full-position route never throws these, but they remain public compatibility
    // shims through v6 (removed in the next major), so consumers pattern-matching on the v5 surface
    // keep compiling.
    expect(new BorrowAmountAndSharesExclusiveError("0x1")).toBeInstanceOf(
      Error,
    );
    expect(
      new RefinanceExceedsCollateralError({
        market: "0x1",
        requested: 2n,
        available: 1n,
      }),
    ).toBeInstanceOf(Error);
    expect(
      new RefinanceExceedsBorrowSharesError({
        market: "0x1",
        requested: 2n,
        available: 1n,
      }),
    ).toBeInstanceOf(Error);
    expect(
      new RefinanceExceedsBorrowAssetsError({
        market: "0x1",
        requested: 2n,
        available: 1n,
      }),
    ).toBeInstanceOf(Error);
    expect(new RefinanceSharesMissingBorrowAssetsError("0x1")).toBeInstanceOf(
      Error,
    );
  });
});
