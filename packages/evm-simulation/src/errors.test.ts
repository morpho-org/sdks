import { expectTypeOf } from "vitest";
import {
  AssetChangeMismatchError,
  AuthorizationRequestMismatchError,
  BlacklistViolationError,
  ConsumerLimitViolationError,
  ExternalServiceError,
  FeeMismatchError,
  InvalidSimulationResponseError,
  isSimulationPackageError,
  MarketConstraintViolationError,
  MissingVerificationEvidenceError,
  PermissionChangeMismatchError,
  ProtocolBindingMismatchError,
  SIMULATION_ERROR_CODES,
  type SimulationErrorContext,
  type SimulationExecutionReason,
  SimulationPackageError,
  SimulationRevertedError,
  SimulationValidationError,
  SimulationVerificationError,
  SlippageLimitExceededError,
  StateChangeMismatchError,
  UnexpectedSimulationError,
  UnsupportedChainError,
  UnsupportedOperationError,
  UnsupportedVerificationFeatureError,
} from "./errors.js";

const CONTEXT: SimulationErrorContext = {
  stage: "validation",
  mode: "final",
  chainId: 1,
  blockNumber: 100n,
};
const EXECUTION: Extract<SimulationErrorContext, { stage: "execution" }> = {
  stage: "execution",
  mode: "preview",
  chainId: 1,
  blockNumber: 100n,
  operation: "blueSupply",
  failedTransactionIndex: 2,
};

describe("error hierarchy", () => {
  it("every concrete error extends SimulationPackageError", () => {
    const instances = [
      new SimulationRevertedError("x"),
      new BlacklistViolationError("x"),
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
    const changes = [
      {
        address: "0x00000000000000000000000000000000000000ab",
        token: "0x00000000000000000000000000000000000000cd",
        netRetained: 100n,
      },
    ] as const;
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

describe("verification error classes", () => {
  const cases = [
    [UnsupportedOperationError, "UNSUPPORTED_OPERATION"],
    [ProtocolBindingMismatchError, "PROTOCOL_BINDING_MISMATCH"],
    [UnsupportedVerificationFeatureError, "UNSUPPORTED_VERIFICATION_FEATURE"],
    [InvalidSimulationResponseError, "INVALID_SIMULATION_RESPONSE"],
    [MissingVerificationEvidenceError, "MISSING_VERIFICATION_EVIDENCE"],
    [AuthorizationRequestMismatchError, "AUTHORIZATION_REQUEST_MISMATCH"],
    [AssetChangeMismatchError, "ASSET_CHANGE_MISMATCH"],
    [PermissionChangeMismatchError, "PERMISSION_CHANGE_MISMATCH"],
    [StateChangeMismatchError, "STATE_CHANGE_MISMATCH"],
    [MarketConstraintViolationError, "MARKET_CONSTRAINT_VIOLATION"],
    [SlippageLimitExceededError, "SLIPPAGE_LIMIT_EXCEEDED"],
    [FeeMismatchError, "FEE_MISMATCH"],
    [ConsumerLimitViolationError, "CONSUMER_LIMIT_VIOLATION"],
    [UnexpectedSimulationError, "UNEXPECTED_SIMULATION_ERROR"],
  ] as const;

  it.each(cases)("%s has its literal code and name", (Ctor, code) => {
    const err = new Ctor("boom", CONTEXT);
    expect(err.code).toBe(code);
    expect(err.name).toBe(Ctor.name);
    expect(err).toBeInstanceOf(SimulationPackageError);
    expect(err).toBeInstanceOf(Error);
  });

  it.each(cases)("%s stores a frozen copy of the context", (Ctor) => {
    const err = new Ctor("boom", EXECUTION);
    expect(err.context).toEqual(EXECUTION);
    expect(err.context).not.toBe(EXECUTION);
    expect(Object.isFrozen(err.context)).toBe(true);
  });

  it.each(cases)("%s keeps the cause", (Ctor) => {
    const cause = new Error("root");
    const err = new Ctor("boom", CONTEXT, { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("SimulationPackageError.context", () => {
  it("is undefined on legacy constructors called without context", () => {
    expect(new SimulationRevertedError("x").context).toBeUndefined();
    expect(new BlacklistViolationError("x").context).toBeUndefined();
    expect(new ExternalServiceError("x").context).toBeUndefined();
    expect(new SimulationValidationError("x").context).toBeUndefined();
    expect(new UnsupportedChainError(1).context).toBeUndefined();
  });

  it("is stored frozen when supplied to a legacy constructor", () => {
    const err = new UnsupportedChainError(1, CONTEXT);
    expect(err.context).toEqual(CONTEXT);
    expect(Object.isFrozen(err.context)).toBe(true);
  });

  it("is not forwarded into Error options", () => {
    const err = new SimulationValidationError("x", undefined, CONTEXT);
    expect(err.context).toEqual(CONTEXT);
    expect(err.cause).toBeUndefined();
  });
});

describe("SimulationRevertedError.reasonCode", () => {
  it("defaults to UNKNOWN_REVERT", () => {
    expect(new SimulationRevertedError("x").reasonCode).toBe("UNKNOWN_REVERT");
  });

  it("carries the mapped cause", () => {
    expect(
      new SimulationRevertedError("x", undefined, "INSUFFICIENT_LIQUIDITY")
        .reasonCode,
    ).toBe("INSUFFICIENT_LIQUIDITY");
  });

  it("is the ADR union", () => {
    expectTypeOf<SimulationExecutionReason>().toEqualTypeOf<
      | "INSUFFICIENT_BALANCE"
      | "INSUFFICIENT_ALLOWANCE"
      | "INSUFFICIENT_LIQUIDITY"
      | "POSITION_UNHEALTHY"
      | "SLIPPAGE_EXCEEDED"
      | "SIGNATURE_EXPIRED"
      | "SIGNATURE_INVALID"
      | "NONCE_ALREADY_USED"
      | "CAP_EXCEEDED"
      | "ACCESS_RESTRICTED"
      | "UNKNOWN_REVERT"
    >();
  });
});

describe("SimulationErrorContext", () => {
  it("is keyed by stage", () => {
    expectTypeOf<SimulationErrorContext["stage"]>().toEqualTypeOf<
      "validation" | "preparation" | "execution" | "verification" | "transport"
    >();
    expectTypeOf<
      SimulationErrorContext["blockNumber"]
    >().toEqualTypeOf<bigint>();
    expectTypeOf<{
      stage: "preparation";
      mode: "preview";
      chainId: 1;
      blockNumber: 1n;
    }>().not.toExtend<SimulationErrorContext>();
    expectTypeOf<{
      stage: "verification";
      mode: "final";
      chainId: 1;
      blockNumber: 1n;
    }>().not.toExtend<SimulationErrorContext>();
  });

  it("SimulationRevertedError only accepts preparation or execution contexts", () => {
    expectTypeOf<
      NonNullable<
        ConstructorParameters<typeof SimulationRevertedError>[3]
      >["stage"]
    >().toEqualTypeOf<"preparation" | "execution">();
  });
});

describe("context on legacy errors", () => {
  it("SimulationRevertedError keeps cause and freezes context", () => {
    const cause = new Error("inner");
    const err = new SimulationRevertedError("x", cause, undefined, EXECUTION);
    expect(err.cause).toBe(cause);
    expect(err.context).toEqual(EXECUTION);
    expect(Object.isFrozen(err.context)).toBe(true);
    expect(
      new SimulationRevertedError("x", "raw", undefined, EXECUTION).context,
    ).toEqual(EXECUTION);
  });

  it("BlacklistViolationError stores context", () => {
    const err = new BlacklistViolationError("x", undefined, CONTEXT);
    expect(err.context).toEqual(CONTEXT);
    expect(Object.isFrozen(err.context)).toBe(true);
  });

  it("verification errors extend SimulationVerificationError with required context", () => {
    const err = new FeeMismatchError("x", CONTEXT);
    expect(err).toBeInstanceOf(SimulationVerificationError);
    expectTypeOf(err.context).toEqualTypeOf<SimulationErrorContext>();
    expectTypeOf(new BlacklistViolationError("x").context).toEqualTypeOf<
      SimulationErrorContext | undefined
    >();
  });
});

describe("SIMULATION_ERROR_CODES", () => {
  const concrete = [
    new SimulationRevertedError("x"),
    new BlacklistViolationError("x"),
    new ExternalServiceError("x"),
    new SimulationValidationError("x"),
    new UnsupportedChainError(1),
    new UnsupportedOperationError("x", CONTEXT),
    new ProtocolBindingMismatchError("x", CONTEXT),
    new UnsupportedVerificationFeatureError("x", CONTEXT),
    new InvalidSimulationResponseError("x", CONTEXT),
    new MissingVerificationEvidenceError("x", CONTEXT),
    new AuthorizationRequestMismatchError("x", CONTEXT),
    new AssetChangeMismatchError("x", CONTEXT),
    new PermissionChangeMismatchError("x", CONTEXT),
    new StateChangeMismatchError("x", CONTEXT),
    new MarketConstraintViolationError("x", CONTEXT),
    new SlippageLimitExceededError("x", CONTEXT),
    new FeeMismatchError("x", CONTEXT),
    new ConsumerLimitViolationError("x", CONTEXT),
    new UnexpectedSimulationError("x", CONTEXT),
  ];

  it("lists exactly the codes of the concrete classes", () => {
    expect(new Set(concrete.map((e) => e.code))).toEqual(
      new Set(SIMULATION_ERROR_CODES),
    );
  });

  it.each(SIMULATION_ERROR_CODES)("guard accepts plain %s", (code) => {
    expect(isSimulationPackageError({ name: "X", message: "m", code })).toBe(
      true,
    );
  });
});

describe("isSimulationPackageError", () => {
  it("is true for instances", () => {
    expect(isSimulationPackageError(new SimulationRevertedError("x"))).toBe(
      true,
    );
    expect(isSimulationPackageError(new FeeMismatchError("x", CONTEXT))).toBe(
      true,
    );
  });

  it("is true for a plain object with a known code", () => {
    expect(
      isSimulationPackageError({
        name: "FeeMismatchError",
        message: "boom",
        code: "FEE_MISMATCH",
        context: { stage: "validation", mode: "final", chainId: 1 },
      }),
    ).toBe(true);
  });

  it("is true for a plain object without context", () => {
    expect(
      isSimulationPackageError({
        name: "FeeMismatchError",
        message: "boom",
        code: "FEE_MISMATCH",
      }),
    ).toBe(true);
  });

  it("is false for a malformed context", () => {
    const base = {
      name: "FeeMismatchError",
      message: "m",
      code: "FEE_MISMATCH",
    };
    expect(isSimulationPackageError({ ...base, context: {} })).toBe(false);
    expect(isSimulationPackageError({ ...base, context: [] })).toBe(false);
    expect(
      isSimulationPackageError({
        ...base,
        context: { stage: "bogus", mode: "final", chainId: 1 },
      }),
    ).toBe(false);
    expect(
      isSimulationPackageError({
        ...base,
        context: { stage: "validation", mode: "bogus", chainId: 1 },
      }),
    ).toBe(false);
    expect(
      isSimulationPackageError({
        ...base,
        context: { stage: "validation", mode: "final", chainId: "1" },
      }),
    ).toBe(false);
    expect(
      isSimulationPackageError({
        ...base,
        context: { stage: "validation", mode: "final", chainId: 1 },
      }),
    ).toBe(true);
  });

  it("is false without a message string", () => {
    expect(
      isSimulationPackageError({
        name: "FeeMismatchError",
        code: "FEE_MISMATCH",
      }),
    ).toBe(false);
  });

  it("is false for an unknown code", () => {
    expect(
      isSimulationPackageError({
        name: "Foo",
        message: "m",
        code: "NOPE",
        context: {},
      }),
    ).toBe(false);
  });

  it("is false for null, plain Errors and non-object context", () => {
    expect(isSimulationPackageError(null)).toBe(false);
    expect(isSimulationPackageError(undefined)).toBe(false);
    expect(isSimulationPackageError(new Error("x"))).toBe(false);
    expect(
      isSimulationPackageError({
        name: "FeeMismatchError",
        message: "m",
        code: "FEE_MISMATCH",
        context: "nope",
      }),
    ).toBe(false);
  });
});
