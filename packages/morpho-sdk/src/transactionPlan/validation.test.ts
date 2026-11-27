import { describe, expect, test } from "vitest";
import { InvalidTransactionPlanError } from "./error.js";
import type { Action, TransactionPlan } from "./types.js";
import { validateTransactionPlanHeader } from "./validation.js";

const account = "0x0000000000000000000000000000000000000001";

const planWith = (
  type: Action["type"],
  inputs: Record<string, unknown>,
): TransactionPlan =>
  ({
    version: 2,
    chainId: 8453,
    account,
    expiresAt: 1_600,
    steps: [
      {
        id: "take",
        action: { type, inputs: { chainId: 8453, account, ...inputs } },
      },
    ],
    signatureRequests: [],
  }) as unknown as TransactionPlan;

describe("validateTransactionPlanHeader", () => {
  describe.each([
    "midnightTakeLend",
    "midnightTakeBorrow",
    "midnightTakeWithdraw",
    "midnightRepayWithdrawCollateral",
    "midnightMakeBorrow",
    "midnightMakeLend",
    "midnightMakeWithdraw",
    "midnightMakeRepay",
    "midnightSupplyCollateralMakeBorrow",
    "midnightSupplyBlueMakeLend",
    "midnightSupplyCollateralTakeBorrow",
    "midnightTakeRepayWithdrawCollateral",
    "midnightSupplyCollateralWithNative",
  ] as const)("%s deadline", (type) => {
    test("default: accepts a deadline equal to expiresAt", () => {
      expect(() =>
        validateTransactionPlanHeader(planWith(type, { deadline: 1_600n })),
      ).not.toThrow();
    });

    test.each([1_601n, 2n ** 128n])(
      "error: throws InvalidTransactionPlanError for a later deadline of %s",
      (deadline) => {
        expect(() =>
          validateTransactionPlanHeader(planWith(type, { deadline })),
        ).toThrow(
          expect.objectContaining({
            constructor: InvalidTransactionPlanError,
            path: "$.steps[0].action.inputs.deadline",
            reason: "expected the plan expiresAt",
          }),
        );
      },
    );

    test("error: throws InvalidTransactionPlanError for a missing deadline", () => {
      expect(() => validateTransactionPlanHeader(planWith(type, {}))).toThrow(
        expect.objectContaining({
          constructor: InvalidTransactionPlanError,
          path: "$.steps[0].action.inputs.deadline",
        }),
      );
    });
  });
});
