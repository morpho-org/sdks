import { describe, expect, expectTypeOf, test } from "vitest";
import {
  AmbiguousExpectedQuoteError,
  AuthorizationRequestMismatchError,
  BlacklistViolationError,
  ConsumerLimitViolationError,
  InvalidChainIdError,
  InvalidSimulationResponseError,
  isSimulationPackageError,
  LimitAccountMismatchError,
  MissingExpectedQuoteError,
  RpcTransportError,
  SIMULATION_ERROR_CODES,
  SimulationAssertError,
  SimulationLogAssertError,
  SimulationPackageError,
  SimulationRevertedError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
  UnexpectedSimulationError,
  UnsupportedChainError,
  UnsupportedLimitActionError,
  UnsupportedOperationError,
} from "./errors.js";
import {
  AmbiguousExpectedQuoteError as EntryAmbiguousExpectedQuoteError,
  LimitAccountMismatchError as EntryLimitAccountMismatchError,
  MissingExpectedQuoteError as EntryMissingExpectedQuoteError,
  UnsupportedLimitActionError as EntryUnsupportedLimitActionError,
} from "./index.js";

const A = "0x0000000000000000000000000000000000000001";
const ASSERTION_FAILURE = {
  transactionIndex: 0,
  phase: "before",
  assertionIndex: 0,
  assertion: { to: A, data: "0x", check: () => "failed" },
  returnData: "0x",
} as const;

const errors = [
  new SimulationRevertedError("reverted"),
  new SimulationAssertError("assertion failed", ASSERTION_FAILURE),
  new SimulationLogAssertError("log assertion failed", {
    transactionIndex: 0,
    assertionIndex: 0,
    assertion: { check: () => "failed" },
    logs: [],
  }),
  new BlacklistViolationError("retained"),
  new SimulationValidationError("invalid"),
  new UnsupportedChainError(1),
  new RpcTransportError("unavailable"),
  new UnsupportedOperationError("unsupported"),
  new InvalidSimulationResponseError("malformed"),
  new SlippageCheckUnavailableError("missing"),
  new AuthorizationRequestMismatchError("mismatch"),
  new ConsumerLimitViolationError("limit"),
  new UnexpectedSimulationError("unexpected"),
  new LimitAccountMismatchError({ field: "onBehalf", expected: A, actual: A }),
  new MissingExpectedQuoteError({
    actionType: "blueSupply",
    field: "sharesMinted",
    expectedHint: "hint",
  }),
  new AmbiguousExpectedQuoteError({
    actionType: "midnightCancelAndMake",
    operations: 2,
  }),
  new UnsupportedLimitActionError("unknownAction"),
];

describe("SimulationPackageError", () => {
  test.each(errors)(
    "behavior: $name exposes standard Error fields and code",
    (error) => {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SimulationPackageError);
      expect(error.message).not.toBe("");
      expect(error.stack).toContain(error.name);
      expect(error).not.toHaveProperty("context");
    },
  );

  test("behavior: codes cover every concrete failure", () => {
    expect(new Set(errors.map((error) => error.code))).toEqual(
      new Set(SIMULATION_ERROR_CODES),
    );
  });

  test("behavior: every constructor preserves the original cause", () => {
    const cause = new Error("original");
    const options = { cause };
    const wrapped = [
      new SimulationRevertedError("reverted", undefined, options),
      new SimulationAssertError("assertion failed", ASSERTION_FAILURE, options),
      new BlacklistViolationError("retained", undefined, options),
      new SimulationValidationError("invalid", undefined, options),
      new UnsupportedChainError(1, options),
      ...[
        RpcTransportError,
        UnsupportedOperationError,
        InvalidSimulationResponseError,
        InvalidChainIdError,
        SlippageCheckUnavailableError,
        AuthorizationRequestMismatchError,
        ConsumerLimitViolationError,
        UnexpectedSimulationError,
      ].map((Ctor) => new Ctor("failure", options)),
    ];
    for (const error of wrapped) expect(error.cause).toBe(cause);
  });

  test("behavior: specialized fields remain available", () => {
    expect(
      new SimulationValidationError("invalid", ["transactions"]).fieldErrors,
    ).toEqual(["transactions"]);
    expect(new UnsupportedChainError(123).chainId).toBe(123);
    const assets = [
      {
        address: A,
        token: "0x0000000000000000000000000000000000000002",
        netRetained: 101n,
      },
    ] as const;
    expect(
      new BlacklistViolationError("retained", assets).assetChanges,
    ).toEqual(assets);
    const error = new SimulationAssertError(
      "assertion failed",
      ASSERTION_FAILURE,
    );
    expect(error).toMatchObject({
      transactionIndex: 0,
      phase: "before",
      assertionIndex: 0,
      assertion: ASSERTION_FAILURE.assertion,
      returnData: "0x",
    });
  });

  test("behavior: wrong-chain errors retain their non-bypassable identity", () => {
    const error = new InvalidChainIdError("wrong chain");
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect(isSimulationPackageError(error)).toBe(true);
    expect(
      isSimulationPackageError({
        name: error.name,
        code: error.code,
        message: error.message,
      }),
    ).toBe(true);
  });
});

describe("error names match class names", () => {
  test.each([
    {
      error: new SimulationRevertedError("x"),
      expected: "SimulationRevertedError",
    },
    {
      error: new SimulationAssertError("assertion failed", ASSERTION_FAILURE),
      expected: "SimulationAssertError",
    },
    {
      error: new SimulationLogAssertError("log assertion failed", {
        transactionIndex: 0,
        assertionIndex: 0,
        assertion: { check: () => "failed" },
        logs: [],
      }),
      expected: "SimulationLogAssertError",
    },
    {
      error: new BlacklistViolationError("x"),
      expected: "BlacklistViolationError",
    },
    { error: new RpcTransportError("x"), expected: "RpcTransportError" },
    {
      error: new SimulationValidationError("x"),
      expected: "SimulationValidationError",
    },
    {
      error: new UnsupportedChainError(1),
      expected: "UnsupportedChainError",
    },
  ])("name: $expected", ({ error, expected }) => {
    expect(error.name).toBe(expected);
  });
});

describe("SimulationAssertError", () => {
  test("is not a transaction revert", () => {
    expect(
      new SimulationAssertError("assertion failed", ASSERTION_FAILURE),
    ).not.toBeInstanceOf(SimulationRevertedError);
  });
});

describe("SimulationLogAssertError", () => {
  test("copies the assertion and logs while preserving coordinates", () => {
    const assertion = { check: () => "failed" };
    const logs = [] as const;
    const error = new SimulationLogAssertError("log assertion failed", {
      transactionIndex: 1,
      assertionIndex: 2,
      assertion,
      logs,
    });
    expect(error).toMatchObject({
      name: "SimulationLogAssertError",
      code: "SIMULATION_ASSERT_FAILED",
      transactionIndex: 1,
      assertionIndex: 2,
      assertion,
      logs,
    });
    expect(error.assertion).not.toBe(assertion);
    expect(error.logs).not.toBe(logs);
    expect(SIMULATION_ERROR_CODES).not.toContain(
      "SIMULATION_LOG_ASSERT_FAILED",
    );
  });
});

describe("SimulationRevertedError", () => {
  test("default", () => {
    const error = new SimulationRevertedError("Transaction 0 reverted");
    expect(error.message).toBe("Transaction 0 reverted");
    expect(error.revertData).toBeUndefined();
    expect(error.transactionIndex).toBeUndefined();
    expect(error.cause).toBeUndefined();
    expect(error.code).toBe("SIMULATION_REVERTED");
    for (const field of ["context", "reason", "details"]) {
      expect(error).not.toHaveProperty(field);
    }
    expectTypeOf<SimulationPackageError>().not.toHaveProperty("context");
  });

  test("behavior: preserves transaction index and original cause", () => {
    const cause = { message: "provider diagnostic" };
    const error = new SimulationRevertedError("reverted", "0x", {
      transactionIndex: 0,
      cause,
    });
    expect(error.transactionIndex).toBe(0);
    expect(error.cause).toBe(cause);
  });

  test.each(["0x", "0xDEADBEEF", "0x1234"] as const)(
    "behavior: preserves exact bytes %s",
    (data) => {
      expect(new SimulationRevertedError("reverted", data).revertData).toBe(
        data,
      );
    },
  );
});

describe("isSimulationPackageError", () => {
  test.each(errors)("behavior: recognizes $name across bundles", (error) => {
    expect(isSimulationPackageError(error)).toBe(true);
    expect(
      isSimulationPackageError({
        name: error.name,
        code: error.code,
        message: error.message,
      }),
    ).toBe(true);
    expect(
      isSimulationPackageError({
        name: "ForeignError",
        code: error.code,
        message: error.message,
      }),
    ).toBe(false);
  });

  test.each([
    null,
    undefined,
    [],
    "failure",
    1,
    new Error("failure"),
    {},
    { name: "SimulationRevertedError", code: "SIMULATION_REVERTED" },
    { name: "SimulationRevertedError", code: "UNKNOWN", message: "failure" },
    {
      name: "SimulationLogAssertError",
      code: "SIMULATION_REVERTED",
      message: "failure",
    },
    {
      name: "RpcTransportError",
      code: "SIMULATION_REVERTED",
      message: "failure",
    },
    { code: "SIMULATION_REVERTED", message: "failure" },
  ])("behavior: rejects unrelated or malformed values", (value) => {
    expect(isSimulationPackageError(value)).toBe(false);
  });
});

test("the entry point exports the toSimulationLimits errors", () => {
  expect(EntryAmbiguousExpectedQuoteError).toBe(AmbiguousExpectedQuoteError);
  expect(EntryLimitAccountMismatchError).toBe(LimitAccountMismatchError);
  expect(EntryMissingExpectedQuoteError).toBe(MissingExpectedQuoteError);
  expect(EntryUnsupportedLimitActionError).toBe(UnsupportedLimitActionError);
});
