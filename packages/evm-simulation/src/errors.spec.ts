import {
  AddressScreeningError,
  BlacklistViolationError,
  ExternalServiceError,
  SimulationPackageError,
  SimulationRevertedError,
  SimulationValidationError,
  UnsupportedChainError,
} from "./errors.js";

describe("error hierarchy", () => {
  it("every concrete error extends SimulationPackageError", () => {
    const instances = [
      new SimulationRevertedError("x"),
      new BlacklistViolationError("x"),
      new AddressScreeningError("x", []),
      new ExternalServiceError("x"),
      new SimulationValidationError("x"),
      new UnsupportedChainError(1),
    ];
    for (const err of instances) {
      expect(err).toBeInstanceOf(SimulationPackageError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});

describe("error codes", () => {
  // Codes are part of the package's public API — consumers switch on them.
  // A rename here is a breaking change.
  it.each([
    [() => new SimulationRevertedError("x"), "SIMULATION_REVERTED"],
    [() => new BlacklistViolationError("x"), "BLACKLIST_ERROR"],
    [() => new AddressScreeningError("x", []), "SCREENING_ERROR"],
    [() => new ExternalServiceError("x"), "EXTERNAL_SERVICE_ERROR"],
    [() => new SimulationValidationError("x"), "VALIDATION_ERROR"],
    [() => new UnsupportedChainError(1), "UNSUPPORTED_CHAIN"],
  ])("code is stable (%#)", (factory, expected) => {
    expect(factory().code).toBe(expected);
  });
});

describe("error names match class names", () => {
  // `err.name` is what structured loggers print.
  it.each([
    [new SimulationRevertedError("x"), "SimulationRevertedError"],
    [new BlacklistViolationError("x"), "BlacklistViolationError"],
    [new AddressScreeningError("x", []), "AddressScreeningError"],
    [new ExternalServiceError("x"), "ExternalServiceError"],
    [new SimulationValidationError("x"), "SimulationValidationError"],
    [new UnsupportedChainError(1), "UnsupportedChainError"],
  ])("name (%#)", (err, expected) => {
    expect(err.name).toBe(expected);
  });
});

describe("SimulationRevertedError", () => {
  it("uses reason as the message when provided", () => {
    const err = new SimulationRevertedError(
      "ERC20: transfer amount exceeds balance",
    );
    expect(err.reason).toBe("ERC20: transfer amount exceeds balance");
    expect(err.message).toBe("ERC20: transfer amount exceeds balance");
  });

  it("falls back to a generic message when reason is undefined", () => {
    const err = new SimulationRevertedError(undefined);
    expect(err.reason).toBeUndefined();
    expect(err.message).toBe("Transaction simulation reverted");
  });

  it("attaches optional details payload", () => {
    const err = new SimulationRevertedError("x", { raw: "tenderly response" });
    expect(err.details).toEqual({ raw: "tenderly response" });
  });
});

describe("BlacklistViolationError", () => {
  it("attaches assetChanges when provided", () => {
    const changes = [{ address: "0xabc", token: "0xdef", netRetained: "100" }];
    const err = new BlacklistViolationError("stuck", changes);
    expect(err.assetChanges).toBe(changes);
  });

  it("allows undefined assetChanges", () => {
    const err = new BlacklistViolationError("stuck");
    expect(err.assetChanges).toBeUndefined();
  });
});

describe("AddressScreeningError", () => {
  it("attaches the flagged addresses array", () => {
    const addrs = ["0x1234567890123456789012345678901234567890"];
    const err = new AddressScreeningError("sanctioned", addrs);
    expect(err.addresses).toBe(addrs);
  });
});

describe("SimulationValidationError", () => {
  it("attaches fieldErrors array", () => {
    const err = new SimulationValidationError("bad input", [
      "foo missing",
      "bar invalid",
    ]);
    expect(err.fieldErrors).toEqual(["foo missing", "bar invalid"]);
  });

  it("allows undefined fieldErrors", () => {
    const err = new SimulationValidationError("bad input");
    expect(err.fieldErrors).toBeUndefined();
  });
});

describe("UnsupportedChainError", () => {
  it("attaches the offending chainId and mentions it in the message", () => {
    const err = new UnsupportedChainError(42161);
    expect(err.chainId).toBe(42161);
    expect(err.message).toContain("42161");
  });
});

describe("ExternalServiceError", () => {
  it("forwards cause via Error options", () => {
    const cause = new Error("underlying fetch failure");
    const err = new ExternalServiceError("Tenderly 502", { cause });
    expect(err.cause).toBe(cause);
  });
});
