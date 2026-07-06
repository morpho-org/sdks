import { describe, expect, test } from "vitest";

import {
  _try,
  DivisionByZeroError,
  IncompleteChainRegistryError,
  InvalidBitLengthError,
  NegativeValueError,
  RegistryValueAlreadyRegisteredError,
  UnknownAddressError,
  UnsupportedChainIdError,
} from "./errors.js";

class TestDataError extends Error {}

class TestMissingError extends TestDataError {}

describe("UnsupportedChainIdError", () => {
  test("default", () => {
    const error = new UnsupportedChainIdError(999);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnsupportedChainIdError");
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

describe("_try", () => {
  test("returns the value when sync accessor succeeds", () => {
    expect(_try(() => 42)).toBe(42);
  });

  test("returns undefined when sync accessor throws and no error class given", () => {
    expect(
      _try(() => {
        throw new Error("oops");
      }),
    ).toBe(undefined);
  });

  test("returns undefined for matching error class", () => {
    expect(
      _try(() => {
        throw new UnknownAddressError({ chainId: 1, label: "midnight" });
      }, UnknownAddressError),
    ).toBe(undefined);
  });

  test("re-throws when error class does not match", () => {
    expect(() =>
      _try(() => {
        throw new TypeError("not me");
      }, UnknownAddressError),
    ).toThrow(TypeError);
  });

  test("matches subclasses", () => {
    expect(
      _try(() => {
        throw new TestMissingError("missing");
      }, TestDataError),
    ).toBe(undefined);
  });

  test("returns the resolved value for async accessor success", async () => {
    expect(await _try(async () => "ok")).toBe("ok");
  });

  test("returns undefined for async rejection on matching error class", async () => {
    expect(
      await _try(async () => {
        throw new UnknownAddressError({ chainId: 1, label: "midnight" });
      }, UnknownAddressError),
    ).toBe(undefined);
  });

  test("re-throws on async rejection when no class matches", async () => {
    await expect(
      _try(async () => {
        throw new TypeError("nope");
      }, UnknownAddressError),
    ).rejects.toThrow(TypeError);
  });
});
