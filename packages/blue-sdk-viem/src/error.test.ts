import type { Address, ChainId } from "@morpho-org/blue-sdk";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { describe, expect, test } from "vitest";
import {
  getUnsupportedVaultV2Adapter,
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
  isUnknownOfFactoryError,
  UnsupportedPermitDomainExtensionsError,
} from "./error.js";

const TOKEN: Address = "0x1111111111111111111111111111111111111111";
const ADAPTER: Address = "0x2222222222222222222222222222222222222222";

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

describe("getUnsupportedVaultV2Adapter", () => {
  test("returns null for a plain Error", () => {
    expect(getUnsupportedVaultV2Adapter(new Error("oops"))).toBeNull();
  });

  test("returns null for a non-Error value", () => {
    expect(getUnsupportedVaultV2Adapter("error")).toBeNull();
    expect(getUnsupportedVaultV2Adapter(null)).toBeNull();
    expect(getUnsupportedVaultV2Adapter(undefined)).toBeNull();
    expect(getUnsupportedVaultV2Adapter(42)).toBeNull();
  });

  test("returns null for a BaseError without a ContractFunctionRevertedError in the chain", () => {
    expect(
      getUnsupportedVaultV2Adapter(
        new BaseError("nope", { details: "no revert here" }),
      ),
    ).toBeNull();
  });

  test("returns the adapter address for a matching ContractFunctionRevertedError", () => {
    const err = new ContractFunctionRevertedError({
      abi: [
        {
          type: "error",
          name: "UnsupportedVaultV2Adapter",
          inputs: [{ type: "address" }],
        },
      ],
      data: "0x" as `0x${string}`,
      functionName: "test",
    });
    Object.defineProperty(err, "data", {
      value: { errorName: "UnsupportedVaultV2Adapter", args: [ADAPTER] },
      configurable: true,
    });
    expect(getUnsupportedVaultV2Adapter(err)).toBe(ADAPTER);
  });

  test("returns null for a ContractFunctionRevertedError with a different errorName", () => {
    const err = new ContractFunctionRevertedError({
      abi: [
        {
          type: "error",
          name: "SomethingElse",
          inputs: [{ type: "address" }],
        },
      ],
      data: "0x" as `0x${string}`,
      functionName: "test",
    });
    Object.defineProperty(err, "data", {
      value: { errorName: "SomethingElse", args: [ADAPTER] },
      configurable: true,
    });
    expect(getUnsupportedVaultV2Adapter(err)).toBeNull();
  });

  test("returns null when args is missing or non-string", () => {
    const err = new ContractFunctionRevertedError({
      abi: [
        {
          type: "error",
          name: "UnsupportedVaultV2Adapter",
          inputs: [{ type: "address" }],
        },
      ],
      data: "0x" as `0x${string}`,
      functionName: "test",
    });
    // args = undefined → falls through to typeof check on first element.
    Object.defineProperty(err, "data", {
      value: { errorName: "UnsupportedVaultV2Adapter" },
      configurable: true,
    });
    expect(getUnsupportedVaultV2Adapter(err)).toBeNull();
  });

  test("walks nested error causes", () => {
    const inner = new ContractFunctionRevertedError({
      abi: [
        {
          type: "error",
          name: "UnsupportedVaultV2Adapter",
          inputs: [{ type: "address" }],
        },
      ],
      data: "0x" as `0x${string}`,
      functionName: "test",
    });
    Object.defineProperty(inner, "data", {
      value: { errorName: "UnsupportedVaultV2Adapter", args: [ADAPTER] },
      configurable: true,
    });
    const outer = new BaseError("wrapper", { cause: inner });
    expect(getUnsupportedVaultV2Adapter(outer)).toBe(ADAPTER);
  });
});

describe("InvalidPermitDomainChainIdError", () => {
  test("preserves token / expectedChainId / domainChainId as readonly fields", () => {
    const err = new InvalidPermitDomainChainIdError(TOKEN, 1 as ChainId, 137);
    expect(err.token).toBe(TOKEN);
    expect(err.expectedChainId).toBe(1);
    expect(err.domainChainId).toBe(137);
  });

  test("message quotes all three values", () => {
    const err = new InvalidPermitDomainChainIdError(TOKEN, 1 as ChainId, 137);
    expect(err.message).toContain(TOKEN);
    expect(err.message).toContain('expected "1"');
    expect(err.message).toContain('got "137"');
  });

  test("handles undefined domainChainId", () => {
    const err = new InvalidPermitDomainChainIdError(
      TOKEN,
      1 as ChainId,
      undefined,
    );
    expect(err.domainChainId).toBeUndefined();
    expect(err.message).toContain('got "undefined"');
  });
});

describe("InvalidPermitDomainVerifyingContractError", () => {
  test("preserves token / domainVerifyingContract as readonly fields", () => {
    const wrong: Address = "0x3333333333333333333333333333333333333333";
    const err = new InvalidPermitDomainVerifyingContractError(TOKEN, wrong);
    expect(err.token).toBe(TOKEN);
    expect(err.domainVerifyingContract).toBe(wrong);
  });

  test("message quotes both values", () => {
    const wrong: Address = "0x3333333333333333333333333333333333333333";
    const err = new InvalidPermitDomainVerifyingContractError(TOKEN, wrong);
    expect(err.message).toContain(`expected "${TOKEN}"`);
    expect(err.message).toContain(`got "${wrong}"`);
  });

  test("handles undefined domainVerifyingContract", () => {
    const err = new InvalidPermitDomainVerifyingContractError(TOKEN, undefined);
    expect(err.domainVerifyingContract).toBeUndefined();
    expect(err.message).toContain('got "undefined"');
  });
});

describe("UnsupportedPermitDomainExtensionsError", () => {
  test("preserves token + copies extensions defensively (input mutation does not leak)", () => {
    const input = [1n, 2n, 3n];
    const err = new UnsupportedPermitDomainExtensionsError(TOKEN, input);
    expect(err.token).toBe(TOKEN);
    expect(err.extensions).toEqual([1n, 2n, 3n]);
    // The constructor copies via `[...extensions]` — mutating the caller's
    // array must not affect the stored copy.
    input.push(4n);
    expect(err.extensions).toEqual([1n, 2n, 3n]);
  });

  test("message lists every extension and quotes the token", () => {
    const err = new UnsupportedPermitDomainExtensionsError(TOKEN, [1n, 2n]);
    expect(err.message).toContain(TOKEN);
    expect(err.message).toContain("1, 2");
    expect(err.message).toContain("Use another approval path");
  });

  test("handles an empty extensions list", () => {
    const err = new UnsupportedPermitDomainExtensionsError(TOKEN, []);
    expect(err.extensions).toEqual([]);
    expect(err.message).toContain('got ""');
  });
});
