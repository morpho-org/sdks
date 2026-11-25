import { zeroAddress } from "viem";
import { ConsumerLimitViolationError } from "../errors.js";
import type { SimulationWarning } from "../warnings.js";
import { unwrapReport } from "./simulate-or-throw.js";

const positionWarning = {
  severity: "warn",
  code: "UNEXPECTED_POSITION_CHANGE",
  chainId: 1,
  message: "Unexpected owner position change",
  protocol: "Blue",
  event: "Borrow",
  owner: zeroAddress,
} as const satisfies SimulationWarning;

describe("unwrapReport", () => {
  test("returns an honest result with no warnings", () => {
    expect(unwrapReport({ ok: true, result: 42, warnings: [] })).toBe(42);
  });

  test("permits unrelated warnings", () => {
    expect(
      unwrapReport({
        ok: true,
        result: 42,
        warnings: [
          {
            severity: "warn",
            code: "RETENTION_CHECK_SKIPPED",
            chainId: 1,
            message: "Skipped retention",
            reason: "unsupported-chain",
          },
        ],
      }),
    ).toBe(42);
  });

  test("rejects a position warning even when the report is successful", () => {
    expect(() =>
      unwrapReport({ ok: true, result: 42, warnings: [positionWarning] }),
    ).toThrow(positionWarning.message);
  });

  test("preserves single failures and aggregates multiple failures", () => {
    const failure = new ConsumerLimitViolationError("limit");
    expect(() =>
      unwrapReport({
        ok: false,
        severity: "error",
        failures: [failure],
        warnings: [],
      }),
    ).toThrow(failure);
    expect(() =>
      unwrapReport({
        ok: false,
        severity: "error",
        failures: [failure, failure],
        warnings: [],
      }),
    ).toThrow(AggregateError);
  });

  test("preserves blocking failures when position warnings are also present", () => {
    const failure = new ConsumerLimitViolationError("limit");
    expect(() =>
      unwrapReport({
        ok: false,
        severity: "error",
        failures: [failure],
        warnings: [positionWarning],
      }),
    ).toThrow(failure);
    try {
      unwrapReport({
        ok: false,
        severity: "error",
        failures: [failure, failure],
        warnings: [positionWarning],
      });
      expect.unreachable("Expected blocking failures");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      if (error instanceof AggregateError) {
        expect(error.errors).toEqual([failure, failure]);
      }
    }
  });
});
