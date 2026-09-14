import { maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import { InputExceedsMaxError, NonPositiveInputError } from "../types/index.js";
import { validateInKindDeadline } from "./validateInKindDeadline.js";

describe("validateInKindDeadline", () => {
  test.each([1n, maxUint256])("behavior: accepts %s", (deadline) => {
    expect(validateInKindDeadline(deadline)).toBe(deadline);
  });
  test.each([0n, -1n])("error: NonPositiveInputError for %s", (deadline) => {
    expect(() => validateInKindDeadline(deadline)).toThrow(
      NonPositiveInputError,
    );
  });
  test("error: InputExceedsMaxError", () => {
    expect(() => validateInKindDeadline(maxUint256 + 1n)).toThrow(
      InputExceedsMaxError,
    );
    try {
      validateInKindDeadline(maxUint256 + 1n);
    } catch (error) {
      expect(error).toMatchObject({
        field: "deadline",
        value: maxUint256 + 1n,
        max: maxUint256,
      });
    }
  });
});
