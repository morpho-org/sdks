import { BaseError, ContractFunctionRevertedError } from "viem";
import { describe, expect, test } from "vitest";
import { isUnknownOfFactoryError } from "./error.js";

describe("isUnknownOfFactoryError", () => {
  test("returns false for a plain Error", () => {
    expect(isUnknownOfFactoryError(new Error("oops"))).toBe(false);
  });

  test("returns false for a non-Error value", () => {
    expect(isUnknownOfFactoryError("error")).toBe(false);
    expect(isUnknownOfFactoryError(null)).toBe(false);
    expect(isUnknownOfFactoryError(undefined)).toBe(false);
    expect(isUnknownOfFactoryError(42)).toBe(false);
  });

  test("returns false for a BaseError without a ContractFunctionRevertedError in the chain", () => {
    expect(
      isUnknownOfFactoryError(
        new BaseError("nope", { details: "no revert here" }),
      ),
    ).toBe(false);
  });

  test("returns true for a ContractFunctionRevertedError with errorName 'UnknownOfFactory'", () => {
    const err = new ContractFunctionRevertedError({
      abi: [
        {
          type: "error",
          name: "UnknownOfFactory",
          inputs: [{ type: "address" }],
        },
      ],
      data: "0x" as `0x${string}`,
      functionName: "test",
    });
    // Force the data shape the helper checks
    Object.defineProperty(err, "data", {
      value: { errorName: "UnknownOfFactory" },
      configurable: true,
    });
    expect(isUnknownOfFactoryError(err)).toBe(true);
  });

  test("returns false for a ContractFunctionRevertedError with a different errorName", () => {
    const err = new ContractFunctionRevertedError({
      abi: [
        {
          type: "error",
          name: "SomethingElse",
          inputs: [],
        },
      ],
      data: "0x" as `0x${string}`,
      functionName: "test",
    });
    Object.defineProperty(err, "data", {
      value: { errorName: "SomethingElse" },
      configurable: true,
    });
    expect(isUnknownOfFactoryError(err)).toBe(false);
  });

  test("walks nested error causes (BaseError wrapping ContractFunctionRevertedError)", () => {
    const inner = new ContractFunctionRevertedError({
      abi: [{ type: "error", name: "UnknownOfFactory", inputs: [] }],
      data: "0x" as `0x${string}`,
      functionName: "test",
    });
    Object.defineProperty(inner, "data", {
      value: { errorName: "UnknownOfFactory" },
      configurable: true,
    });
    const outer = new BaseError("wrapper", { cause: inner });
    expect(isUnknownOfFactoryError(outer)).toBe(true);
  });
});
