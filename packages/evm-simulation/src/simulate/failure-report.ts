import type {
  SimulationErrorSeverity,
  SimulationPackageError,
} from "../errors.js";
import type {
  SimulationFailure,
  SimulationReportVerification,
} from "../result.js";
import type { SimulationWarning } from "../warnings.js";

const SEVERITY_RANK = {
  warn: 0,
  error: 1,
  fatal: 2,
} as const satisfies Record<SimulationErrorSeverity, number>;

/**
 * Builds a frozen failed report whose `severity` is the highest of its failures' (`fatal` > `error` > `warn`).
 * @internal
 */
export function toFailureReport(
  failures: readonly SimulationPackageError[],
  diagnostics: {
    readonly warnings?: readonly SimulationWarning[];
    readonly verification?: SimulationReportVerification;
  } = {},
): SimulationFailure {
  const { warnings = [], verification } = diagnostics;
  const severity = failures.reduce<SimulationErrorSeverity>(
    (highest, failure) =>
      SEVERITY_RANK[failure.severity] > SEVERITY_RANK[highest]
        ? failure.severity
        : highest,
    "warn",
  );
  return Object.freeze({
    ok: false,
    severity,
    failures: Object.freeze([...failures]),
    warnings: Object.freeze([...warnings]),
    ...(verification === undefined
      ? {}
      : { verification: Object.freeze({ ...verification }) }),
  });
}
