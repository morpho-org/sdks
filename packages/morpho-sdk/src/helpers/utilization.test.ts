import { MathLib } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import { InputExceedsMaxError, NegativeInputError } from "../types/index.js";
import {
  DEFAULT_CAP_ACCRUAL_BUFFER,
  DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
} from "./constant.js";
import {
  resolveCapAccrualBuffer,
  resolveMaxWithdrawalUtilization,
} from "./utilization.js";

describe("resolveCapAccrualBuffer", () => {
  test("default", () => {
    expect(resolveCapAccrualBuffer()).toBe(DEFAULT_CAP_ACCRUAL_BUFFER);
  });
  test("behavior: accepts a custom value", () => {
    expect(resolveCapAccrualBuffer(123n)).toBe(123n);
  });
  test("error: NegativeInputError", () => {
    expect(() => resolveCapAccrualBuffer(-1n)).toThrow(NegativeInputError);
    try {
      resolveCapAccrualBuffer(-1n);
    } catch (error) {
      expect(error).toMatchObject({ field: "capAccrualBuffer", value: -1n });
    }
  });
});

describe("resolveMaxWithdrawalUtilization", () => {
  test.each([
    "defaultMaxWithdrawalUtilization",
    "maxWithdrawalUtilization",
  ] as const)("error: preserves the %s option name", (field) => {
    for (const [value, error] of [
      [-1n, NegativeInputError],
      [MathLib.WAD + 1n, InputExceedsMaxError],
    ] as const) {
      expect(() => resolveMaxWithdrawalUtilization(value, field)).toThrow(
        error,
      );
      try {
        resolveMaxWithdrawalUtilization(value, field);
      } catch (caught) {
        expect(caught).toMatchObject({ field, value });
      }
    }
  });

  test("default", () => {
    expect(resolveMaxWithdrawalUtilization(undefined)).toBe(
      DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
    );
  });
  test.each([0n, MathLib.WAD])("behavior: accepts boundary %s", (value) => {
    expect(resolveMaxWithdrawalUtilization(value)).toBe(value);
  });
  test("error: NegativeInputError", () => {
    expect(() => resolveMaxWithdrawalUtilization(-1n)).toThrow(
      NegativeInputError,
    );
  });
  test("error: InputExceedsMaxError", () => {
    expect(() => resolveMaxWithdrawalUtilization(MathLib.WAD + 1n)).toThrow(
      InputExceedsMaxError,
    );
  });
});
