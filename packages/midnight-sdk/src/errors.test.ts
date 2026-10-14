import * as morphoTs from "@morpho-org/morpho-ts";
import { describe, expect, test } from "vitest";
import * as midnightSdk from "./index.js";

describe("deprecated accrual error aliases", () => {
  test("preserve morpho-ts class identity", () => {
    expect(midnightSdk.InvalidPositionAccrualTimestampError).toBe(
      morphoTs.InvalidPositionAccrualTimestampError,
    );
    expect(midnightSdk.InvalidPositionLossFactorError).toBe(
      morphoTs.InvalidPositionLossFactorError,
    );
    expect(midnightSdk.InvalidPositionAccrualStateError).toBe(
      morphoTs.InvalidPositionAccrualStateError,
    );
  });
});
