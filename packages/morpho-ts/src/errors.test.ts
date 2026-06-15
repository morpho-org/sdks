import { describe, expect, test } from "vitest";

import {
  DivisionByZeroError,
  IncompleteMidnightAddressesError,
  IncompleteMidnightDeploymentsError,
  InvalidBitLengthError,
  MidnightAddressAlreadyRegisteredError,
  MidnightDeploymentAlreadyRegisteredError,
  NegativeValueError,
  RegistryValueAlreadyRegisteredError,
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

describe("IncompleteMidnightAddressesError", () => {
  test("default", () => {
    const error = new IncompleteMidnightAddressesError(31_337, ["midnight"]);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("IncompleteMidnightAddressesError");
    expect(error.message).toContain("31337");
    expect(error.message).toContain("midnight");
  });
});

describe("IncompleteMidnightDeploymentsError", () => {
  test("default", () => {
    const error = new IncompleteMidnightDeploymentsError(31_337, ["permit2"]);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("IncompleteMidnightDeploymentsError");
    expect(error.message).toContain("31337");
    expect(error.message).toContain("permit2");
  });
});

describe("MidnightAddressAlreadyRegisteredError", () => {
  test("default", () => {
    const error = new MidnightAddressAlreadyRegisteredError({
      chainId: 31_337,
      label: "midnight",
      registeredAddress: "0x0000000000000000000000000000000000000001",
      requestedAddress: "0x0000000000000000000000000000000000000002",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MidnightAddressAlreadyRegisteredError");
    expect(error.message).toContain("31337.midnight");
  });
});

describe("MidnightDeploymentAlreadyRegisteredError", () => {
  test("default", () => {
    const error = new MidnightDeploymentAlreadyRegisteredError({
      chainId: 31_337,
      label: "midnight",
      registeredDeployment: 1n,
      requestedDeployment: 2n,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MidnightDeploymentAlreadyRegisteredError");
    expect(error.message).toContain("31337.midnight");
  });
});
