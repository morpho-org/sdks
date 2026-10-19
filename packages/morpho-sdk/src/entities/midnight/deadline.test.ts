import { Time } from "@morpho-org/morpho-ts";
import { maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import { ExpiredDeadlineError } from "../../types/index.js";
import { validateMidnightDeadline } from "./deadline.js";

describe("validateMidnightDeadline", () => {
  const now = 1_800_000_000n;

  test.each([0n, -1n, 1n, now - 1n, now])(
    "rejects deadline %s at or before now",
    (deadline) => {
      expect(() => validateMidnightDeadline(deadline, now)).toThrow(
        new ExpiredDeadlineError(deadline, now),
      );
    },
  );

  test.each([now + 1n, maxUint256])(
    "accepts deadline %s after now",
    (deadline) => {
      expect(() => validateMidnightDeadline(deadline, now)).not.toThrow();
    },
  );

  test("defaults now to the local clock", () => {
    const current = Time.timestamp();
    expect(() => validateMidnightDeadline(current - 1n)).toThrow(
      ExpiredDeadlineError,
    );
    expect(() => validateMidnightDeadline(current + 3_600n)).not.toThrow();
  });
});
