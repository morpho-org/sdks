import { describe, expect, expectTypeOf, test } from "vitest";
import {
  AmbiguousExpectedQuoteError,
  ApprovalCheckUnavailableError,
  AuthorizationRequestMismatchError,
  BlacklistViolationError,
  CONSUMER_LIMIT_CHECKS,
  ConsumerLimitViolationError,
  InvalidChainIdError,
  InvalidSimulationResponseError,
  isSimulationPackageError,
  LimitAccountMismatchError,
  MissingExpectedQuoteError,
  RpcTransportError,
  SIMULATION_ERROR_CODES,
  SimulationAssertError,
  type SimulationErrorCode,
  SimulationInfrastructureError,
  SimulationInvalidRequestError,
  SimulationLogAssertError,
  SimulationPackageError,
  SimulationRejectedError,
  SimulationRevertedError,
  SimulationSafetyError,
  SimulationValidationError,
  SLIPPAGE_CHECK_UNAVAILABLE_REASONS,
  SlippageCheckUnavailableError,
  UnexpectedMidnightAuthorizationError,
  UnexpectedMorphoAuthorizationError,
  UnexpectedSimulationError,
  UnexpectedTokenApprovalError,
  UnsupportedChainError,
  UnsupportedLimitActionError,
  UnsupportedOperationError,
  UnusedAuthorizationError,
} from "./errors.js";
import {
  AmbiguousExpectedQuoteError as EntryAmbiguousExpectedQuoteError,
  LimitAccountMismatchError as EntryLimitAccountMismatchError,
  MissingExpectedQuoteError as EntryMissingExpectedQuoteError,
  SlippageCheckUnavailableError as EntrySlippageCheckUnavailableError,
  SLIPPAGE_CHECK_UNAVAILABLE_REASONS as EntryUnavailableReasons,
  UnsupportedLimitActionError as EntryUnsupportedLimitActionError,
} from "./index.js";

const ERROR_GROUPS = [
  SimulationSafetyError,
  SimulationRejectedError,
  SimulationInvalidRequestError,
  SimulationInfrastructureError,
] as const;
const ERROR_GROUP_BY_CODE = {
  BLACKLIST_ERROR: SimulationSafetyError,
  UNEXPECTED_TOKEN_APPROVAL: SimulationSafetyError,
  UNEXPECTED_MORPHO_AUTHORIZATION: SimulationSafetyError,
  UNEXPECTED_MIDNIGHT_AUTHORIZATION: SimulationSafetyError,
  CONSUMER_LIMIT_VIOLATION: SimulationRejectedError,
  SIMULATION_ASSERT_FAILED: SimulationRejectedError,
  UNUSED_AUTHORIZATION: SimulationRejectedError,
  SIMULATION_REVERTED: SimulationRejectedError,
  VALIDATION_ERROR: SimulationInvalidRequestError,
  UNSUPPORTED_CHAIN: SimulationInvalidRequestError,
  UNSUPPORTED_OPERATION: SimulationInvalidRequestError,
  AUTHORIZATION_REQUEST_MISMATCH: SimulationInvalidRequestError,
  LIMIT_ACCOUNT_MISMATCH: SimulationInvalidRequestError,
  MISSING_EXPECTED_QUOTE: SimulationInvalidRequestError,
  AMBIGUOUS_EXPECTED_QUOTE: SimulationInvalidRequestError,
  UNSUPPORTED_LIMIT_ACTION: SimulationInvalidRequestError,
  SLIPPAGE_CHECK_UNAVAILABLE: SimulationInfrastructureError,
  APPROVAL_CHECK_UNAVAILABLE: SimulationInfrastructureError,
  RPC_TRANSPORT_ERROR: SimulationInfrastructureError,
  INVALID_SIMULATION_RESPONSE: SimulationInfrastructureError,
  UNEXPECTED_SIMULATION_ERROR: SimulationInfrastructureError,
} satisfies Record<SimulationErrorCode, (typeof ERROR_GROUPS)[number]>;

const A = "0x0000000000000000000000000000000000000001";
const ASSERTION_FAILURE = {
  transactionIndex: 0,
  phase: "before",
  assertionIndex: 0,
  assertion: { to: A, data: "0x", check: () => "failed" },
  returnData: "0x",
} as const;

const errors = [
  new UnusedAuthorizationError(0, {
    type: "erc2612Permit",
    typedData: {
      domain: { chainId: 1, verifyingContract: A },
      primaryType: "Permit",
      types: { Permit: [] },
      message: { owner: A, spender: A, value: 1n, nonce: 0n, deadline: 1n },
    },
  }),
  new UnusedAuthorizationError(1, {
    type: "midnightAuthorizationSignature",
    typedData: {
      domain: { chainId: 1, verifyingContract: A },
      primaryType: "Authorization",
      types: { Authorization: [] },
      message: {
        authorizer: A,
        authorized: A,
        isAuthorized: true,
        nonce: 1n,
        deadline: 1n,
      },
    },
  }),
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
  new InvalidChainIdError("wrong chain"),
  new SlippageCheckUnavailableError("missing"),
  new ApprovalCheckUnavailableError("unavailable"),
  new UnexpectedMorphoAuthorizationError({
    authorizer: A,
    authorized: A,
    source: "event",
  }),
  new UnexpectedMidnightAuthorizationError({
    onBehalf: A,
    authorized: A,
  }),
  new UnexpectedTokenApprovalError({
    token: A,
    owner: A,
    spender: A,
    source: "event",
  }),
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

describe("SlippageCheckUnavailableError", () => {
  test("behavior: exposes operation facts without changing message or cause", () => {
    const cause = new Error("original");
    const error = new EntrySlippageCheckUnavailableError("missing", {
      cause,
      operationIndex: 2,
      operationType: "blueSupply",
      field: "sharesMinted",
      reason: "missingRead",
    });
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect(error).toMatchObject({
      message: "missing",
      cause,
      code: "SLIPPAGE_CHECK_UNAVAILABLE",
      operationIndex: 2,
      operationType: "blueSupply",
      field: "sharesMinted",
      reason: "missingRead",
    });
  });

  test("behavior: legacy constructors keep optional fields", () => {
    const cause = new Error("original");
    const error = new SlippageCheckUnavailableError("missing", { cause });
    expect(error.message).toBe("missing");
    expect(error.cause).toBe(cause);
    expect(error.operationIndex).toBeUndefined();
    expect(error.operationType).toBeUndefined();
    expect(error.field).toBeUndefined();
    expect(error.reason).toBeUndefined();
    expectTypeOf(error.operationIndex).toEqualTypeOf<number | undefined>();
  });

  test("behavior: reasons are a fixed exported set", () => {
    expect(EntryUnavailableReasons).toBe(SLIPPAGE_CHECK_UNAVAILABLE_REASONS);
    expect(SLIPPAGE_CHECK_UNAVAILABLE_REASONS).toEqual([
      "missingRead",
      "emptyData",
      "zeroDerivedAmount",
      "missingEvent",
      "unmatchedEvent",
      "accountMismatch",
      "noRegisteredWrappedNative",
    ]);
  });
});

describe("ConsumerLimitViolationError", () => {
  test("behavior: exposes the structured violation it is given", () => {
    const error = new ConsumerLimitViolationError("limit", {
      operationIndex: 1,
      operationType: "blueSupply",
      field: "sharesMinted",
      check: "slippageTolerance",
      expected: 100n,
      observed: 98n,
      tolerance: 10_000000000000000n,
      bound: 99n,
    });
    expect({ ...error }).toMatchObject({
      code: "CONSUMER_LIMIT_VIOLATION",
      operationIndex: 1,
      operationType: "blueSupply",
      field: "sharesMinted",
      check: "slippageTolerance",
      expected: 100n,
      observed: 98n,
      tolerance: 10_000000000000000n,
      bound: 99n,
    });
    expect(error.message).toBe("limit");
    expect(error.entry).toBeUndefined();
    expect(
      new ConsumerLimitViolationError("limit", {
        entry: { collateralIndex: 2n },
      }).entry,
    ).toEqual({ collateralIndex: 2n });
  });

  test("behavior: check kinds are a fixed exported set", () => {
    expect(CONSUMER_LIMIT_CHECKS).toMatchInlineSnapshot(`
      [
        "slippageTolerance",
        "derivedBound",
        "exactQuote",
        "inactiveLeg",
        "noMovement",
        "unquotedMarket",
        "positionBound",
        "unchangedState",
        "shareTransfer",
      ]
    `);
  });
});

describe("SimulationPackageError", () => {
  test("the code list and group map cover the stable error surface", () => {
    expect(SIMULATION_ERROR_CODES).toMatchInlineSnapshot(`
      [
        "VALIDATION_ERROR",
        "UNSUPPORTED_CHAIN",
        "RPC_TRANSPORT_ERROR",
        "SIMULATION_REVERTED",
        "SIMULATION_ASSERT_FAILED",
        "BLACKLIST_ERROR",
        "UNSUPPORTED_OPERATION",
        "INVALID_SIMULATION_RESPONSE",
        "SLIPPAGE_CHECK_UNAVAILABLE",
        "AUTHORIZATION_REQUEST_MISMATCH",
        "CONSUMER_LIMIT_VIOLATION",
        "UNEXPECTED_SIMULATION_ERROR",
        "LIMIT_ACCOUNT_MISMATCH",
        "MISSING_EXPECTED_QUOTE",
        "AMBIGUOUS_EXPECTED_QUOTE",
        "UNSUPPORTED_LIMIT_ACTION",
        "UNEXPECTED_TOKEN_APPROVAL",
        "UNEXPECTED_MORPHO_AUTHORIZATION",
        "UNEXPECTED_MIDNIGHT_AUTHORIZATION",
        "APPROVAL_CHECK_UNAVAILABLE",
        "UNUSED_AUTHORIZATION",
      ]
    `);
    expectTypeOf<
      keyof typeof ERROR_GROUP_BY_CODE
    >().toEqualTypeOf<SimulationErrorCode>();
    expectTypeOf<
      (typeof errors)[number]["code"]
    >().toEqualTypeOf<SimulationErrorCode>();
  });
  test.each(errors)(
    "behavior: $name exposes standard Error fields and code",
    (error) => {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SimulationPackageError);
      expect(error.message).not.toBe("");
      expect(error.stack).toContain(error.name);
      expect(error).not.toHaveProperty("context");
      expect(ERROR_GROUPS.filter((Group) => error instanceof Group)).toEqual([
        ERROR_GROUP_BY_CODE[error.code],
      ]);
      expect(error).not.toHaveProperty("type");
      expect(error.findings).toEqual([]);
      expect(Object.isFrozen(error.findings)).toBe(true);
    },
  );

  test("codes are grouped under exactly one public parent class", () => {
    expect(
      Object.fromEntries(
        ERROR_GROUPS.map((Group) => [
          Group.name,
          [
            ...new Set(
              errors
                .filter((error) => error instanceof Group)
                .map((error) => error.code),
            ),
          ].sort(),
        ]),
      ),
    ).toMatchInlineSnapshot(`
      {
        "SimulationInfrastructureError": [
          "APPROVAL_CHECK_UNAVAILABLE",
          "INVALID_SIMULATION_RESPONSE",
          "RPC_TRANSPORT_ERROR",
          "SLIPPAGE_CHECK_UNAVAILABLE",
          "UNEXPECTED_SIMULATION_ERROR",
        ],
        "SimulationInvalidRequestError": [
          "AMBIGUOUS_EXPECTED_QUOTE",
          "AUTHORIZATION_REQUEST_MISMATCH",
          "LIMIT_ACCOUNT_MISMATCH",
          "MISSING_EXPECTED_QUOTE",
          "UNSUPPORTED_CHAIN",
          "UNSUPPORTED_LIMIT_ACTION",
          "UNSUPPORTED_OPERATION",
          "VALIDATION_ERROR",
        ],
        "SimulationRejectedError": [
          "CONSUMER_LIMIT_VIOLATION",
          "SIMULATION_ASSERT_FAILED",
          "SIMULATION_REVERTED",
          "UNUSED_AUTHORIZATION",
        ],
        "SimulationSafetyError": [
          "BLACKLIST_ERROR",
          "UNEXPECTED_MIDNIGHT_AUTHORIZATION",
          "UNEXPECTED_MORPHO_AUTHORIZATION",
          "UNEXPECTED_TOKEN_APPROVAL",
        ],
      }
    `);
  });

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
        ApprovalCheckUnavailableError,
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

  test("behavior: unexpected approval messages instruct consumers not to sign", () => {
    expect(
      new UnexpectedTokenApprovalError({
        token: A,
        owner: A,
        spender: "0x0000000000000000000000000000000000000002",
        source: "event",
      }).message,
    ).toBe(
      `Token approval for "${A}" from "${A}" to "0x0000000000000000000000000000000000000002" is not part of the requested operation. Do not sign this request; if the approval is intended, add it to limits.approvals.`,
    );
    expect(
      new UnexpectedMorphoAuthorizationError({
        authorizer: A,
        authorized: "0x0000000000000000000000000000000000000002",
        source: "authorization",
      }).message,
    ).toBe(
      `Morpho authorization from "${A}" to "0x0000000000000000000000000000000000000002" is not part of the requested operation. Do not sign this request; if the authorization is intended, add it to limits.approvals.`,
    );
    expect(
      new UnexpectedMidnightAuthorizationError({
        onBehalf: A,
        authorized: "0x0000000000000000000000000000000000000002",
      }).message,
    ).toBe(
      `Midnight authorization from "${A}" to "0x0000000000000000000000000000000000000002" is not part of the requested operation. Do not sign this request; if the authorization is intended, add it to limits.approvals.`,
    );
    const unexpectedMidnight = new UnexpectedMidnightAuthorizationError({
      onBehalf: A,
      authorized: "0x0000000000000000000000000000000000000002",
      allowlistable: false,
    });
    expect(unexpectedMidnight.allowlistable).toBe(false);
    expect(unexpectedMidnight.message).toBe(
      `Midnight authorization from "${A}" to "0x0000000000000000000000000000000000000002" is not part of any supported operation and cannot be added to limits.approvals. Do not sign this request.`,
    );
    expect(
      new UnexpectedMidnightAuthorizationError({
        onBehalf: A,
        authorized: A,
      }).allowlistable,
    ).toBe(true);
    const nft = new UnexpectedTokenApprovalError({
      token: A,
      owner: A,
      spender: "0x0000000000000000000000000000000000000002",
      source: "event",
      allowlistable: false,
    });
    expect(nft.allowlistable).toBe(false);
    expect(nft.message).toBe(
      `Approval for "${A}" from "${A}" to "0x0000000000000000000000000000000000000002" is not part of any supported operation and cannot be added to limits.approvals. Do not sign this request.`,
    );
    expect(
      new UnexpectedTokenApprovalError({
        token: A,
        owner: A,
        spender: A,
        source: "event",
      }).allowlistable,
    ).toBe(true);
    const foreignDomain = new UnexpectedMorphoAuthorizationError({
      authorizer: A,
      authorized: A,
      source: "authorization",
      allowlistable: false,
    });
    expect(foreignDomain.allowlistable).toBe(false);
    expect(foreignDomain.message).toBe(
      `Morpho authorization from "${A}" to "${A}" is not part of any supported operation and cannot be added to limits.approvals. Do not sign this request.`,
    );
    expect(
      new UnusedAuthorizationError(0, {
        type: "midnightAuthorizationSignature",
        typedData: {
          domain: { chainId: 1, verifyingContract: A },
          primaryType: "Authorization",
          types: { Authorization: [] },
          message: {
            authorizer: A,
            authorized: A,
            isAuthorized: true,
            nonce: 1n,
            deadline: 1n,
          },
        },
      }).message,
    ).toContain("SetIsAuthorized");
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
        findings: error.findings,
      }),
    ).toBe(true);
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
  test("behavior: rejects cyclic findings without throwing", () => {
    const value = {
      name: "SimulationRevertedError",
      code: "SIMULATION_REVERTED",
      message: "reverted",
      findings: [] as unknown[],
    };
    value.findings.push(value);
    expect(isSimulationPackageError(value)).toBe(false);
  });

  test("behavior: rejects findings entries with non-empty findings", () => {
    const entry = {
      name: "SimulationRevertedError",
      code: "SIMULATION_REVERTED",
      message: "reverted",
      findings: [new SimulationRevertedError("nested")],
    };
    expect(isSimulationPackageError({ ...entry, findings: [entry] })).toBe(
      false,
    );
  });

  test("behavior: narrows legacy objects to assignable package errors", () => {
    const value: unknown = {
      name: "SimulationRevertedError",
      code: "SIMULATION_REVERTED",
      message: "reverted",
    };
    expect(isSimulationPackageError(value)).toBe(true);
    if (isSimulationPackageError(value)) {
      expectTypeOf(value).toEqualTypeOf<SimulationPackageError>();
      const packageErrors: SimulationPackageError[] = [];
      packageErrors.push(value);
      expect(packageErrors).toEqual([value]);
      expectTypeOf(value.findings).toEqualTypeOf<
        readonly SimulationPackageError[] | undefined
      >();
      expect(value.findings ?? []).toEqual([]);
    }
  });

  test.each([
    { findings: [] },
    { findings: [new SimulationRevertedError("reverted")] },
    {
      findings: [
        {
          name: "SimulationRevertedError",
          code: "SIMULATION_REVERTED",
          message: "reverted",
        },
      ],
    },
  ])("behavior: accepts array findings %s", ({ findings }) => {
    expect(
      isSimulationPackageError({
        name: "SimulationRevertedError",
        code: "SIMULATION_REVERTED",
        message: "reverted",
        findings,
      }),
    ).toBe(true);
  });

  test.each([{ findings: [null] }, { findings: [{}] }])(
    "behavior: rejects malformed findings entries %s",
    ({ findings }) => {
      expect(
        isSimulationPackageError({
          name: "SimulationRevertedError",
          code: "SIMULATION_REVERTED",
          message: "reverted",
          findings,
        }),
      ).toBe(false);
      const error = new SimulationRevertedError("reverted");
      Object.defineProperty(error, "findings", { value: findings });
      expect(isSimulationPackageError(error)).toBe(false);
    },
  );

  test.each([undefined, null, {}, "failure", 0])(
    "behavior: rejects present non-array findings %s",
    (findings) => {
      expect(
        isSimulationPackageError({
          name: "SimulationRevertedError",
          code: "SIMULATION_REVERTED",
          message: "reverted",
          findings,
        }),
      ).toBe(false);
      const error = new SimulationRevertedError("reverted");
      Object.defineProperty(error, "findings", { value: findings });
      expect(isSimulationPackageError(error)).toBe(false);
    },
  );

  test("behavior: unused authorization identity survives a renamed constructor", () => {
    class Renamed extends UnusedAuthorizationError {}
    const error = new Renamed(
      0,
      (errors[0] as UnusedAuthorizationError).authorization,
    );
    expect(error.name).toBe("UnusedAuthorizationError");
    expect(
      isSimulationPackageError({
        name: error.name,
        code: error.code,
        message: error.message,
      }),
    ).toBe(true);
  });

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
