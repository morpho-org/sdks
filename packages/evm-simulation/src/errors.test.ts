import type { MarketId } from "@morpho-org/blue-sdk";
import { expectTypeOf } from "vitest";
import {
  AuthorizationRequestMismatchError,
  BlacklistViolationError,
  ConsumerLimitViolationError,
  ExternalServiceError,
  InvalidChainIdError,
  InvalidSimulationResponseError,
  isSimulationPackageError,
  MissingVerificationEvidenceError,
  SIMULATION_ERROR_CODES,
  type SimulationErrorContext,
  type SimulationExecutionContext,
  type SimulationExecutionReason,
  SimulationPackageError,
  SimulationRevertedError,
  SimulationValidationError,
  type SimulationVerificationContext,
  UnexpectedSimulationError,
  UnsupportedChainError,
  UnsupportedOperationError,
} from "./errors.js";
import {
  BLUE_MARKET_OPERATION_TYPES,
  type BlueMarketOperationType,
  OPERATION_TYPES,
  type OperationLimit,
  type OperationType,
  type SimulationOperationSubject,
  VAULT_OPERATION_TYPES,
  type VaultOperationType,
} from "./limits.js";
import { SIMULATION_MODES } from "./params.js";
import type { SimulatedOperation } from "./result.js";

const CONTEXT: SimulationErrorContext = {
  stage: "validation",
  mode: "final",
  chainId: 1,
  blockNumber: 100n,
};
const EXECUTION: SimulationExecutionContext = {
  stage: "execution",
  mode: "preview",
  chainId: 1,
  blockNumber: 100n,
  operation: "blueSupply",
  marketId: "0xmarket" as MarketId,
  failedTransactionIndex: 2,
};

const A = "0x0000000000000000000000000000000000000001";
/** One well-formed subject per operation, keyed by operation group. */
const SUBJECTS: Record<
  OperationType,
  Record<string, unknown>
> = Object.fromEntries(
  OPERATION_TYPES.map((operation) => {
    if (operation === "blueRefinance")
      return [operation, { sourceMarketId: "0xa", targetMarketId: "0xb" }];
    if (operation === "vaultV1MigrateToV2")
      return [operation, { sourceVault: A, targetVault: A }];
    return [
      operation,
      operation.startsWith("blue") ? { marketId: "0xa" } : { vault: A },
    ];
  }),
) as Record<OperationType, Record<string, unknown>>;

describe("error hierarchy", () => {
  it("every concrete error extends SimulationPackageError", () => {
    const instances = [
      new SimulationRevertedError("x"),
      new BlacklistViolationError("x"),
      new ExternalServiceError("x"),
      new SimulationValidationError("x"),
      new UnsupportedChainError(1),
      new InvalidChainIdError("x", { context: CONTEXT }),
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
    const err = new SimulationRevertedError("x", { raw: "node response" });
    expect(err.details).toEqual({ raw: "node response" });
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
        address: "0x00000000000000000000000000000000000000AB",
        token: "0x00000000000000000000000000000000000000cD",
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
    const err = new ExternalServiceError("RPC 502", { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("verification error classes", () => {
  const cases = [
    [UnsupportedOperationError, "UNSUPPORTED_OPERATION"],
    [InvalidSimulationResponseError, "INVALID_SIMULATION_RESPONSE"],
    [MissingVerificationEvidenceError, "MISSING_VERIFICATION_EVIDENCE"],
    [AuthorizationRequestMismatchError, "AUTHORIZATION_REQUEST_MISMATCH"],
    [ConsumerLimitViolationError, "CONSUMER_LIMIT_VIOLATION"],
    [UnexpectedSimulationError, "UNEXPECTED_SIMULATION_ERROR"],
  ] as const;

  it.each(cases)("%s has its literal code and name", (Ctor, code) => {
    const err = new Ctor("boom", { context: CONTEXT });
    expect(err.code).toBe(code);
    expect(err.name).toBe(Ctor.name);
    expect(err).toBeInstanceOf(SimulationPackageError);
    expect(err).toBeInstanceOf(Error);
  });

  it.each(cases)("%s stores a frozen copy of the context", (Ctor) => {
    const err = new Ctor("boom", { context: EXECUTION });
    expect(err.context).toEqual(EXECUTION);
    expect(err.context).not.toBe(EXECUTION);
    expect(Object.isFrozen(err.context)).toBe(true);
  });

  it.each(cases)("%s keeps the cause", (Ctor) => {
    const cause = new Error("root");
    const err = new Ctor("boom", { context: CONTEXT, cause });
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

  it("keys execution/verification contexts by operation group", () => {
    type Verification = SimulationVerificationContext;
    expectTypeOf<Verification["operation"]>().toEqualTypeOf<OperationType>();
    expectTypeOf<
      Extract<Verification, { marketId: MarketId }>["operation"]
    >().toEqualTypeOf<BlueMarketOperationType>();
    expectTypeOf<
      Extract<Verification, { operation: "blueRefinance" }>
    >().not.toHaveProperty("marketId");
    expectTypeOf<
      Extract<Verification, { vault: `0x${string}` }>["operation"]
    >().toEqualTypeOf<VaultOperationType>();
    expectTypeOf<
      Extract<Verification, { operation: "vaultV1MigrateToV2" }>
    >().not.toHaveProperty("vault");
    expectTypeOf<SimulatedOperation>().toExtend<SimulationOperationSubject>();
    expectTypeOf<
      SimulatedOperation["operation"]
    >().toEqualTypeOf<OperationType>();
    expectTypeOf<{
      transactionIndex: number;
      operation: "blueRefinance";
      vault: `0x${string}`;
    }>().not.toExtend<SimulatedOperation>();
    const base = {
      stage: "verification",
      mode: "final",
      chainId: 1,
      blockNumber: 1n,
    } as const;
    expectTypeOf<
      typeof base & { operation: "blueSupply" }
    >().not.toExtend<SimulationErrorContext>();
    expectTypeOf<
      typeof base & { operation: "blueRefinance"; sourceMarketId: MarketId }
    >().not.toExtend<SimulationErrorContext>();
    expectTypeOf<
      typeof base & {
        operation: "vaultV1MigrateToV2";
        sourceVault: `0x${string}`;
        targetVault: `0x${string}`;
      }
    >().toExtend<SimulationErrorContext>();
    expectTypeOf<
      typeof base & { operation: "blueAuthorization" }
    >().not.toExtend<SimulationErrorContext>();
    expectTypeOf<
      typeof base & {
        operation: "blueAuthorization";
        authorized: `0x${string}`;
      }
    >().not.toExtend<SimulationErrorContext>();
  });

  it("operation groups partition OPERATION_TYPES", () => {
    expectTypeOf<OperationLimit["type"]>().toEqualTypeOf<OperationType>();
    expectTypeOf<
      | BlueMarketOperationType
      | VaultOperationType
      | "blueRefinance"
      | "vaultV1MigrateToV2"
    >().toEqualTypeOf<OperationType>();
    expect(
      [
        ...BLUE_MARKET_OPERATION_TYPES,
        "blueRefinance",
        ...VAULT_OPERATION_TYPES,
        "vaultV1MigrateToV2",
      ].sort(),
    ).toEqual([...OPERATION_TYPES].sort());
    expect([...OPERATION_TYPES]).toEqual([
      "blueSupply",
      "blueWithdraw",
      "blueSupplyCollateral",
      "blueBorrow",
      "blueSupplyCollateralBorrow",
      "blueRepay",
      "blueWithdrawCollateral",
      "blueRepayWithdrawCollateral",
      "blueRefinance",
      "vaultV1Deposit",
      "vaultV2Deposit",
      "vaultV1Withdraw",
      "vaultV2Withdraw",
      "vaultV1Redeem",
      "vaultV2Redeem",
      "vaultV2ForceWithdraw",
      "vaultV2ForceRedeem",
      "vaultV1InKindRedeem",
      "vaultV2InKindRedeem",
      "vaultV1MigrateToV2",
    ]);
    expect([...SIMULATION_MODES]).toEqual(["preview", "final"]);
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

  it("verification errors extend SimulationPackageError directly", () => {
    const err = new ConsumerLimitViolationError("x", { context: CONTEXT });
    expect(Object.getPrototypeOf(ConsumerLimitViolationError)).toBe(
      SimulationPackageError,
    );
    expect(err.context).toEqual(CONTEXT);
    expectTypeOf(err.context).toEqualTypeOf<
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
    new InvalidChainIdError("x", { context: CONTEXT }),
    new UnsupportedOperationError("x", { context: CONTEXT }),
    new InvalidSimulationResponseError("x", { context: CONTEXT }),
    new MissingVerificationEvidenceError("x", { context: CONTEXT }),
    new AuthorizationRequestMismatchError("x", { context: CONTEXT }),
    new ConsumerLimitViolationError("x", { context: CONTEXT }),
    new UnexpectedSimulationError("x", { context: CONTEXT }),
  ];

  it("lists exactly the codes of the concrete classes", () => {
    expect(new Set(concrete.map((e) => e.code))).toEqual(
      new Set(SIMULATION_ERROR_CODES),
    );
  });

  it.each(concrete)("guard accepts plain $name", ({ name, code }) => {
    expect(isSimulationPackageError({ name, message: "m", code })).toBe(true);
  });

  it.each(concrete)("guard rejects $code under a foreign name", ({ code }) => {
    expect(
      isSimulationPackageError({ name: "FetchError", message: "m", code }),
    ).toBe(false);
  });

  it.each(
    concrete.map((e, i) => ({
      code: e.code,
      name: concrete[(i + 1) % concrete.length]!.name,
    })),
  )(
    "guard rejects $code under another package class name $name",
    ({ code, name }) => {
      expect(isSimulationPackageError({ name, message: "m", code })).toBe(
        false,
      );
    },
  );
});

describe("isSimulationPackageError", () => {
  it("is true for instances", () => {
    expect(isSimulationPackageError(new SimulationRevertedError("x"))).toBe(
      true,
    );
    expect(
      isSimulationPackageError(
        new ConsumerLimitViolationError("x", { context: CONTEXT }),
      ),
    ).toBe(true);
  });

  it("is true for a plain object with a known code", () => {
    expect(
      isSimulationPackageError({
        name: "ConsumerLimitViolationError",
        message: "boom",
        code: "CONSUMER_LIMIT_VIOLATION",
        context: {
          stage: "validation",
          mode: "final",
          chainId: 1,
          blockNumber: 1n,
        },
      }),
    ).toBe(true);
  });

  it("is true for a plain object without context", () => {
    expect(
      isSimulationPackageError({
        name: "ConsumerLimitViolationError",
        message: "boom",
        code: "CONSUMER_LIMIT_VIOLATION",
      }),
    ).toBe(true);
  });

  it("is false for a malformed context", () => {
    const base = {
      name: "ConsumerLimitViolationError",
      message: "m",
      code: "CONSUMER_LIMIT_VIOLATION",
    };
    expect(isSimulationPackageError({ ...base, context: {} })).toBe(false);
    expect(isSimulationPackageError({ ...base, context: [] })).toBe(false);
    expect(
      isSimulationPackageError({
        ...base,
        context: { stage: "bogus", mode: "final", chainId: 1, blockNumber: 1n },
      }),
    ).toBe(false);
    expect(
      isSimulationPackageError({
        ...base,
        context: {
          stage: "validation",
          mode: "bogus",
          chainId: 1,
          blockNumber: 1n,
        },
      }),
    ).toBe(false);
    expect(
      isSimulationPackageError({
        ...base,
        context: {
          stage: "validation",
          mode: "final",
          chainId: "1",
          blockNumber: 1n,
        },
      }),
    ).toBe(false);
    expect(
      isSimulationPackageError({
        ...base,
        context: { stage: "validation", mode: "final", chainId: 1 },
      }),
    ).toBe(false);
    expect(
      isSimulationPackageError({
        ...base,
        context: {
          stage: "validation",
          mode: "final",
          chainId: 1,
          blockNumber: "1",
        },
      }),
    ).toBe(false);
    expect(
      isSimulationPackageError({
        ...base,
        context: {
          stage: "preparation",
          mode: "final",
          chainId: 1,
          blockNumber: 1n,
        },
      }),
    ).toBe(false);
    expect(
      isSimulationPackageError({
        ...base,
        context: {
          stage: "preparation",
          mode: "final",
          chainId: 1,
          blockNumber: 1n,
          authorizationIndex: 0,
        },
      }),
    ).toBe(true);
    expect(
      isSimulationPackageError({
        ...base,
        context: {
          stage: "validation",
          mode: "final",
          chainId: 1,
          blockNumber: 1n,
        },
      }),
    ).toBe(true);
  });

  it("is false without a message string", () => {
    expect(
      isSimulationPackageError({
        name: "ConsumerLimitViolationError",
        code: "CONSUMER_LIMIT_VIOLATION",
      }),
    ).toBe(false);
  });

  it("is false without a name string", () => {
    expect(
      isSimulationPackageError({
        message: "m",
        code: "CONSUMER_LIMIT_VIOLATION",
      }),
    ).toBe(false);
    expect(
      isSimulationPackageError({
        name: 1,
        message: "m",
        code: "CONSUMER_LIMIT_VIOLATION",
      }),
    ).toBe(false);
  });

  const base = {
    name: "ConsumerLimitViolationError",
    message: "m",
    code: "CONSUMER_LIMIT_VIOLATION",
  };
  const ctx = { mode: "final", chainId: 1, blockNumber: 1n };

  it("requires a known operation on execution and verification contexts", () => {
    for (const stage of ["execution", "verification"]) {
      expect(
        isSimulationPackageError({ ...base, context: { ...ctx, stage } }),
      ).toBe(false);
      expect(
        isSimulationPackageError({
          ...base,
          context: { ...ctx, stage, operation: "bogus", marketId: "0xa" },
        }),
      ).toBe(false);
    }
    expect(
      isSimulationPackageError({
        ...base,
        context: { ...ctx, stage: "transport" },
      }),
    ).toBe(true);
    expect(isSimulationPackageError({ ...base, context: EXECUTION })).toBe(
      true,
    );
  });

  it("accepts a field-only verification context on a plain error object", () => {
    expect(
      isSimulationPackageError({
        name: "MissingVerificationEvidenceError",
        message: "State read failed",
        code: "MISSING_VERIFICATION_EVIDENCE",
        context: {
          stage: "verification",
          mode: "final",
          chainId: 1,
          blockNumber: 1n,
          field: "balance:token:account",
        },
      }),
    ).toBe(true);
  });

  it.each(OPERATION_TYPES)(
    "accepts %s with its subject and rejects it without",
    (operation) => {
      const subject = SUBJECTS[operation];
      for (const stage of ["execution", "verification"]) {
        expect(
          isSimulationPackageError({
            ...base,
            context: { ...ctx, stage, operation, ...subject },
          }),
        ).toBe(true);
        for (const key of Object.keys(subject)) {
          const { [key]: _, ...partial } = subject;
          expect(
            isSimulationPackageError({
              ...base,
              context: { ...ctx, stage, operation, ...partial },
            }),
          ).toBe(false);
        }
      }
    },
  );

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
        name: "ConsumerLimitViolationError",
        message: "m",
        code: "CONSUMER_LIMIT_VIOLATION",
        context: "nope",
      }),
    ).toBe(false);
  });
});
