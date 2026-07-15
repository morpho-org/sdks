import { describe, expect, test } from "vitest";
import {
  NegativeInputError,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveInputError,
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
