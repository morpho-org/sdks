import {
  ConsumerLimitViolationError,
  SlippageCheckUnavailableError,
} from "../errors.js";
import {
  installStructuredLimitViolationCheck,
  missingLimitViolationFields,
  missingSlippageUnavailableFields,
} from "./structured-limit-violation.js";

const structured = new ConsumerLimitViolationError("limit", {
  operationIndex: 0,
  operationType: "blueSupply",
  field: "sharesMinted",
  check: "slippageTolerance",
  expected: 100n,
  observed: 98n,
  tolerance: 10_000000000000000n,
  bound: 99n,
});

describe("missingLimitViolationFields", () => {
  test("behavior: a structured violation lacks nothing", () => {
    expect(missingLimitViolationFields(structured)).toEqual([]);
  });

  test("behavior: a message-only violation lacks every required field", () => {
    expect(
      missingLimitViolationFields(new ConsumerLimitViolationError("limit")),
    ).toEqual([
      "operationIndex",
      "operationType",
      "field",
      "check",
      "expected",
      "observed",
    ]);
  });

  test("behavior: an unknown check is reported", () => {
    const unknown = Object.assign(
      new ConsumerLimitViolationError("limit", { ...structured }),
      {},
    );
    Object.defineProperty(unknown, "check", { value: "guess" });
    expect(missingLimitViolationFields(unknown)).toEqual(["check"]);
  });
});

describe("installStructuredLimitViolationCheck", () => {
  test("behavior: unavailable checks accept scoped and bundle-wide facts, not message-only errors", () => {
    const uninstall = installStructuredLimitViolationCheck();
    try {
      expect(
        new SlippageCheckUnavailableError("missing", {
          operationIndex: 1,
          operationType: "blueSupply",
          field: "sharesMinted",
          reason: "missingRead",
        }),
      ).toBeInstanceOf(SlippageCheckUnavailableError);
      expect(
        new SlippageCheckUnavailableError("missing", {
          field: "sharedRead",
          reason: "missingRead",
        }),
      ).toBeInstanceOf(SlippageCheckUnavailableError);
      expect(
        () =>
          new SlippageCheckUnavailableError("missing") instanceof
          SlippageCheckUnavailableError,
      ).toThrow('lacks structured fields ["reason","field"]');
      expect(() =>
        expect(new SlippageCheckUnavailableError("missing")).toBeInstanceOf(
          SlippageCheckUnavailableError,
        ),
      ).toThrow("lacks structured fields");
      expect(() =>
        expect(() => {
          throw new SlippageCheckUnavailableError("missing");
        }).toThrow(SlippageCheckUnavailableError),
      ).toThrow("lacks structured fields");
    } finally {
      uninstall();
      installStructuredLimitViolationCheck();
    }
  });

  test("behavior: instanceof passes structured and rejects message-only violations", () => {
    const uninstall = installStructuredLimitViolationCheck();
    try {
      expect(structured instanceof ConsumerLimitViolationError).toBe(true);
      expect(new Error("other") instanceof ConsumerLimitViolationError).toBe(
        false,
      );
      expect(
        () =>
          new ConsumerLimitViolationError("limit") instanceof
          ConsumerLimitViolationError,
      ).toThrow('lacks structured fields ["operationIndex"');
    } finally {
      uninstall();
      installStructuredLimitViolationCheck();
    }
  });
});

describe("missingSlippageUnavailableFields", () => {
  test("behavior: missing fields, invalid reasons and partial operation scope are rejected", () => {
    expect(
      missingSlippageUnavailableFields(
        new SlippageCheckUnavailableError("missing"),
      ),
    ).toEqual(["reason", "field"]);
    const error = new SlippageCheckUnavailableError("missing", {
      field: "market",
      reason: "missingRead",
      operationIndex: 0,
    });
    expect(missingSlippageUnavailableFields(error)).toEqual(["operationType"]);
    Object.defineProperty(error, "reason", { value: "guess" });
    expect(missingSlippageUnavailableFields(error)).toEqual([
      "reason",
      "operationType",
    ]);
    expect(
      missingSlippageUnavailableFields(
        new SlippageCheckUnavailableError("missing", {
          field: "market",
          reason: "missingRead",
          operationType: "blueSupply",
        }),
      ),
    ).toEqual(["operationIndex"]);
  });
});
