import { expectTypeOf } from "vitest";
import type {
  ConsumerConstraintContext,
  SimulationErrorCodes,
  SimulationErrorContext,
} from "./domain/diagnostics.js";
import {
  AssetChangeMismatchError,
  AuthorizationRequestMismatchError,
  BlacklistViolationError,
  ConsumerLimitViolationError,
  ExternalServiceError,
  FeeMismatchError,
  InvalidSimulationResponseError,
  MarketConstraintViolationError,
  MissingVerificationEvidenceError,
  PermissionChangeMismatchError,
  ProtocolBindingMismatchError,
  SimulationPackageError,
  SimulationRevertedError,
  SimulationValidationError,
  SlippageLimitExceededError,
  StateChangeMismatchError,
  UnexpectedSimulationError,
  UnsupportedChainError,
  UnsupportedOperationError,
  UnsupportedVerificationFeatureError,
} from "./errors.js";

const context: SimulationErrorContext = { stage: "execution" };
const constraint = {
  type: "wallet",
  field: "maxDebit",
  account: "0x0000000000000000000000000000000000000001",
  token: "0x0000000000000000000000000000000000000002",
  boundAssets: 1n,
  observedAssets: 2n,
} satisfies ConsumerConstraintContext;

describe("error hierarchy", () => {
  it("every concrete error extends SimulationPackageError", () => {
    const instances = [
      new SimulationRevertedError("x"),
      new BlacklistViolationError("x"),
      new ExternalServiceError("x"),
      new SimulationValidationError("x"),
      new UnsupportedChainError(1),
      new UnsupportedOperationError("x", context),
      new ProtocolBindingMismatchError("x", context),
      new UnsupportedVerificationFeatureError("x", context),
      new InvalidSimulationResponseError("x", context),
      new MissingVerificationEvidenceError("x", context),
      new AuthorizationRequestMismatchError("x", context),
      new AssetChangeMismatchError("x", context),
      new PermissionChangeMismatchError("x", context),
      new StateChangeMismatchError("x", context),
      new MarketConstraintViolationError("x", context),
      new SlippageLimitExceededError("x", context),
      new FeeMismatchError("x", context),
      new ConsumerLimitViolationError("x", context, constraint),
      new UnexpectedSimulationError("x", context),
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
    [() => new ExternalServiceError("x"), "EXTERNAL_SERVICE_ERROR"],
    [() => new SimulationValidationError("x"), "VALIDATION_ERROR"],
    [() => new UnsupportedChainError(1), "UNSUPPORTED_CHAIN"],
    [
      () => new UnsupportedOperationError("x", context),
      "UNSUPPORTED_OPERATION",
    ],
    [
      () => new ProtocolBindingMismatchError("x", context),
      "PROTOCOL_BINDING_MISMATCH",
    ],
    [
      () => new UnsupportedVerificationFeatureError("x", context),
      "UNSUPPORTED_VERIFICATION_FEATURE",
    ],
    [
      () => new InvalidSimulationResponseError("x", context),
      "INVALID_SIMULATION_RESPONSE",
    ],
    [
      () => new MissingVerificationEvidenceError("x", context),
      "MISSING_VERIFICATION_EVIDENCE",
    ],
    [
      () => new AuthorizationRequestMismatchError("x", context),
      "AUTHORIZATION_REQUEST_MISMATCH",
    ],
    [() => new AssetChangeMismatchError("x", context), "ASSET_CHANGE_MISMATCH"],
    [
      () => new PermissionChangeMismatchError("x", context),
      "PERMISSION_CHANGE_MISMATCH",
    ],
    [() => new StateChangeMismatchError("x", context), "STATE_CHANGE_MISMATCH"],
    [
      () => new MarketConstraintViolationError("x", context),
      "MARKET_CONSTRAINT_VIOLATION",
    ],
    [
      () => new SlippageLimitExceededError("x", context),
      "SLIPPAGE_LIMIT_EXCEEDED",
    ],
    [() => new FeeMismatchError("x", context), "FEE_MISMATCH"],
    [
      () => new ConsumerLimitViolationError("x", context, constraint),
      "CONSUMER_LIMIT_VIOLATION",
    ],
    [
      () => new UnexpectedSimulationError("x", context),
      "UNEXPECTED_SIMULATION_ERROR",
    ],
  ])("code is stable (%#)", (factory, expected) => {
    expect(factory().code).toBe(expected);
  });
});

describe("error names match class names", () => {
  // `err.name` is what structured loggers print.
  it.each([
    [new SimulationRevertedError("x"), "SimulationRevertedError"],
    [new BlacklistViolationError("x"), "BlacklistViolationError"],
    [new ExternalServiceError("x"), "ExternalServiceError"],
    [new SimulationValidationError("x"), "SimulationValidationError"],
    [new UnsupportedChainError(1), "UnsupportedChainError"],
    [new UnsupportedOperationError("x", context), "UnsupportedOperationError"],
    [
      new ProtocolBindingMismatchError("x", context),
      "ProtocolBindingMismatchError",
    ],
    [
      new UnsupportedVerificationFeatureError("x", context),
      "UnsupportedVerificationFeatureError",
    ],
    [
      new InvalidSimulationResponseError("x", context),
      "InvalidSimulationResponseError",
    ],
    [
      new MissingVerificationEvidenceError("x", context),
      "MissingVerificationEvidenceError",
    ],
    [
      new AuthorizationRequestMismatchError("x", context),
      "AuthorizationRequestMismatchError",
    ],
    [new AssetChangeMismatchError("x", context), "AssetChangeMismatchError"],
    [
      new PermissionChangeMismatchError("x", context),
      "PermissionChangeMismatchError",
    ],
    [new StateChangeMismatchError("x", context), "StateChangeMismatchError"],
    [
      new MarketConstraintViolationError("x", context),
      "MarketConstraintViolationError",
    ],
    [
      new SlippageLimitExceededError("x", context),
      "SlippageLimitExceededError",
    ],
    [new FeeMismatchError("x", context), "FeeMismatchError"],
    [
      new ConsumerLimitViolationError("x", context, constraint),
      "ConsumerLimitViolationError",
    ],
    [new UnexpectedSimulationError("x", context), "UnexpectedSimulationError"],
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
    expect(err.cause).toBeUndefined();
  });

  it("forwards an Error details payload as cause", () => {
    const cause = new Error("execution reverted");
    const err = new SimulationRevertedError("x", cause);
    expect(err.details).toBe(cause);
    expect(err.cause).toBe(cause);
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

describe("v5 verification errors", () => {
  it("codes satisfy the SimulationErrorCodes registry", () => {
    const codes = {
      SimulationValidationError: new SimulationValidationError("x").code,
      UnsupportedChainError: new UnsupportedChainError(1).code,
      ExternalServiceError: new ExternalServiceError("x").code,
      SimulationRevertedError: new SimulationRevertedError("x").code,
      BlacklistViolationError: new BlacklistViolationError("x").code,
      UnsupportedOperationError: new UnsupportedOperationError("x", context)
        .code,
      ProtocolBindingMismatchError: new ProtocolBindingMismatchError(
        "x",
        context,
      ).code,
      UnsupportedVerificationFeatureError:
        new UnsupportedVerificationFeatureError("x", context).code,
      InvalidSimulationResponseError: new InvalidSimulationResponseError(
        "x",
        context,
      ).code,
      MissingVerificationEvidenceError: new MissingVerificationEvidenceError(
        "x",
        context,
      ).code,
      AuthorizationRequestMismatchError: new AuthorizationRequestMismatchError(
        "x",
        context,
      ).code,
      AssetChangeMismatchError: new AssetChangeMismatchError("x", context).code,
      PermissionChangeMismatchError: new PermissionChangeMismatchError(
        "x",
        context,
      ).code,
      StateChangeMismatchError: new StateChangeMismatchError("x", context).code,
      MarketConstraintViolationError: new MarketConstraintViolationError(
        "x",
        context,
      ).code,
      SlippageLimitExceededError: new SlippageLimitExceededError("x", context)
        .code,
      FeeMismatchError: new FeeMismatchError("x", context).code,
      ConsumerLimitViolationError: new ConsumerLimitViolationError(
        "x",
        context,
        constraint,
      ).code,
      UnexpectedSimulationError: new UnexpectedSimulationError("x", context)
        .code,
    } satisfies SimulationErrorCodes;
    expectTypeOf(codes).toExtend<SimulationErrorCodes>();
    expect(Object.keys(codes)).toHaveLength(19);
  });

  it("attaches the error context and forwards cause", () => {
    const cause = new Error("probe timeout");
    const err = new MissingVerificationEvidenceError("missing", context, {
      cause,
    });
    expect(err.context).toBe(context);
    expect(err.cause).toBe(cause);
  });

  it("ConsumerLimitViolationError carries the bound constraint", () => {
    const err = new ConsumerLimitViolationError("over", context, constraint);
    expect(err.constraint).toBe(constraint);
    expect(err.context).toBe(context);
  });
});
