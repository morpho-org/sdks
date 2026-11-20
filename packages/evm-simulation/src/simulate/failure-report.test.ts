import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  BlacklistViolationError,
  RpcTransportError,
  SimulationAssertError,
  SimulationRevertedError,
  SimulationValidationError,
} from "../errors.js";
import { toFailureReport } from "./failure-report.js";

const SEVERITY_RANK = { warn: 0, error: 1, fatal: 2 } as const;

const assertFailure = () =>
  new SimulationAssertError("assert", {
    transactionIndex: 0,
    phase: "after",
    assertionIndex: 0,
    assertion: {
      to: "0x0000000000000000000000000000000000000001",
      data: "0x",
      check: () => "failed",
    },
    returnData: "0x",
  });

describe("toFailureReport", () => {
  test("default: keeps the failures in order and freezes the report", () => {
    const failures = [assertFailure(), new SimulationRevertedError("reverted")];
    const report = toFailureReport(failures);
    expect(report).toEqual({ ok: false, severity: "warn", failures });
    expect(report.failures).not.toBe(failures);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.failures)).toBe(true);
  });

  test.each([
    [[assertFailure(), new RpcTransportError("rpc")], "error"],
    [[new SimulationValidationError("invalid"), assertFailure()], "error"],
    [
      [
        assertFailure(),
        new BlacklistViolationError("blacklisted"),
        new RpcTransportError("rpc"),
      ],
      "fatal",
    ],
  ] as const)(
    "behavior: severity is the highest of the failures' (%#)",
    (failures, severity) => {
      expect(toFailureReport(failures).severity).toBe(severity);
    },
  );

  test.prop(
    [
      fc.array(
        fc.constantFrom(
          assertFailure,
          () => new SimulationRevertedError("reverted"),
          () => new SimulationValidationError("invalid"),
          () => new RpcTransportError("rpc"),
          () => new BlacklistViolationError("blacklisted"),
        ),
        { minLength: 1, maxLength: 8 },
      ),
    ],
    { numRuns: 1000 },
  )(
    "behavior: severity is the highest-ranked failure severity for any list",
    (makers) => {
      const failures = makers.map((make) => make());
      const highest = Math.max(
        ...failures.map((failure) => SEVERITY_RANK[failure.severity]),
      );
      const report = toFailureReport(failures);
      expect(SEVERITY_RANK[report.severity]).toBe(highest);
      expect(report.failures).toEqual(failures);
    },
  );
});
