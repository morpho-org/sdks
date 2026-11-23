import { expect, test } from "vitest";
import { UnsupportedTransactionPlanVersionError } from "./error.js";
import { validateTransactionPlanVersion } from "./version.js";

test("accepts stored format 2", () => {
  expect(() => validateTransactionPlanVersion(2)).not.toThrow();
});

test.each([0, 1, 3, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects unsupported stored format %s",
  (version) => {
    expect(() => validateTransactionPlanVersion(version)).toThrow(
      new UnsupportedTransactionPlanVersionError(version),
    );
  },
);
