import { UnsupportedTransactionPlanVersionError } from "./error.js";

/** @internal Rejects unsupported plan versions before interpreting stored fields. */
export function validateTransactionPlanVersion(version: number): void {
  if (version !== 2) {
    throw new UnsupportedTransactionPlanVersionError(version);
  }
}
