import { describe, expect, test } from "vitest";

import {
  DivisionByZeroError,
  IncompleteChainRegistryError,
  InvalidBitLengthError,
  NegativeValueError,
  RegistryValueAlreadyRegisteredError,
  UnknownAddressError,
  UnsupportedChainIdError,
} from "./errors.js";

describe("UnsupportedChainIdError", () => {
  test("default", () => {
    const error = new UnsupportedChainIdError(999);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnsupportedChainIdError");
    expect(error.code).toBe("UNSUPPORTED_CHAIN");
    expect(error.chainId).toBe(999);
    expect(error.message).toContain("999");
  });
});

describe("InvalidBitLengthError", () => {
  test("default", () => {
    const error = new InvalidBitLengthError(7);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InvalidBitLengthError");
    expect(error.nBits).toBe(7);
    expect(error.message).toContain("7");
  });
});

describe("DivisionByZeroError", () => {
  test("default", () => {
    const error = new DivisionByZeroError("denominator");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DivisionByZeroError");
    expect(error.field).toBe("denominator");
    expect(error.message).toContain("denominator");
  });
});

describe("NegativeValueError", () => {
  test("default", () => {
    const error = new NegativeValueError("assets", -1n);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("NegativeValueError");
    expect(error.message).toContain("assets");
    expect(error.message).toContain("-1");
  });
});

describe("RegistryValueAlreadyRegisteredError", () => {
  test("default", () => {
    const error = new RegistryValueAlreadyRegisteredError({
      label: "31337.midnight",
      registeredValue: "0x0000000000000000000000000000000000000001",
      requestedValue: "0x0000000000000000000000000000000000000002",
      type: "address",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("RegistryValueAlreadyRegisteredError");
    expect(error.message).toContain("31337.midnight");
    expect(error.message).toContain("address");
  });
});

describe("IncompleteChainRegistryError", () => {
  test("default", () => {
    const error = new IncompleteChainRegistryError({
      chainId: 31_337,
      type: "address",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("IncompleteChainRegistryError");
    expect(error.chainId).toBe(31_337);
    expect(error.type).toBe("address");
    expect(error.message).toContain("31337");
  });
});

describe("UnknownAddressError", () => {
  test("default", () => {
    const error = new UnknownAddressError({
      chainId: 31_337,
      label: "midnight",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnknownAddressError");
    expect(error.chainId).toBe(31_337);
    expect(error.label).toBe("midnight");
    expect(error.message).toContain("31337");
    expect(error.message).toContain("midnight");
  });
});
