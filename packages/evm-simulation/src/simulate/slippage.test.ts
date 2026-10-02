import { describe, expect, test } from "vitest";
import {
  ConsumerLimitViolationError,
  MissingVerificationEvidenceError,
  type SimulationVerificationContext,
} from "../errors.js";
import type { SlippageLimits } from "../limits.js";
import { checkSlippage } from "./slippage.js";

const context: SimulationVerificationContext = {
  stage: "verification",
  mode: "final",
  chainId: 1,
  blockNumber: 1n,
  operation: "vaultV2Deposit",
  vault: "0x0000000000000000000000000000000000000001",
};

describe("checkSlippage", () => {
  test.each([
    { field: "assetsReceived", accepted: 990n, rejected: 989n },
    { field: "sharesMinted", accepted: 990n, rejected: 989n },
    { field: "assetsPaid", accepted: 1010n, rejected: 1011n },
    { field: "sharesBurned", accepted: 1010n, rejected: 1011n },
  ] as const)(
    "behavior: inclusive 1% tolerance for $field",
    ({ field, accepted, rejected }) => {
      const limits: SlippageLimits = {
        quote: { [field]: 1000n },
        slippageTolerance: 10_000000000000000n,
      };
      expect(
        checkSlippage({ limits, observed: { [field]: accepted }, context }),
      ).toEqual(limits);
      expect(
        checkSlippage({ limits, observed: { [field]: 1000n }, context }),
      ).toEqual(limits);
      expect(() =>
        checkSlippage({ limits, observed: { [field]: rejected }, context }),
      ).toThrow(ConsumerLimitViolationError);
    },
  );
  test("behavior: minting debt shares is capped and burning debt shares is floored", () => {
    const debtLimits: SlippageLimits = {
      quote: { sharesMinted: 1000n },
      slippageTolerance: 10_000000000000000n,
    };
    expect(() =>
      checkSlippage({
        limits: debtLimits,
        observed: { sharesMinted: 1011n },
        context,
        debtShares: true,
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(
      checkSlippage({
        limits: debtLimits,
        observed: { sharesMinted: 980n },
        context,
        debtShares: true,
      }),
    ).toEqual(debtLimits);

    const repayLimits: SlippageLimits = {
      quote: { sharesBurned: 1000n },
      slippageTolerance: 10_000000000000000n,
    };
    expect(() =>
      checkSlippage({
        limits: repayLimits,
        observed: { sharesBurned: 980n },
        context,
        debtShares: true,
      }),
    ).toThrow(ConsumerLimitViolationError);
    expect(
      checkSlippage({
        limits: repayLimits,
        observed: { sharesBurned: 1020n },
        context,
        debtShares: true,
      }),
    ).toEqual(repayLimits);
  });
  test.each(["sharesMinted", "assetsPaid"] as const)(
    "behavior: rounding does not weaken tolerance for $field",
    (field) => {
      const limits = {
        quote: { [field]: 1n },
        slippageTolerance: 10_000000000000000n,
      };
      expect(
        checkSlippage({ limits, observed: { [field]: 1n }, context }),
      ).toEqual(limits);
      expect(() =>
        checkSlippage({
          limits,
          observed: { [field]: field === "sharesMinted" ? 0n : 2n },
          context,
        }),
      ).toThrow(ConsumerLimitViolationError);
    },
  );
  test("behavior: zero tolerance and zero quote remain explicit", () => {
    const limits = { quote: { assetsPaid: 0n }, slippageTolerance: 0n };
    expect(
      checkSlippage({ limits, observed: { assetsPaid: 0n }, context }),
    ).toEqual(limits);
    expect(() =>
      checkSlippage({ limits, observed: { assetsPaid: 1n }, context }),
    ).toThrow(ConsumerLimitViolationError);
  });
  test("error: MissingVerificationEvidenceError", () => {
    expect(() =>
      checkSlippage({
        limits: { quote: { assetsPaid: 0n }, slippageTolerance: 0n },
        observed: {},
        context,
      }),
    ).toThrow(MissingVerificationEvidenceError);
  });
  test("behavior: favorable movement and unquoted amounts are unchecked", () => {
    const limits = {
      quote: { sharesMinted: 100n, assetsPaid: 100n },
      slippageTolerance: 0n,
    };
    const result = checkSlippage({
      limits,
      observed: { sharesMinted: 110n, assetsPaid: 90n, sharesBurned: 999n },
      context,
    });
    expect(result).toEqual(limits);
    expect(Object.isFrozen(result.quote)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(limits.quote)).toBe(false);
  });
  test("behavior: 100% tolerance retains inclusive boundaries", () => {
    const limits = {
      quote: { sharesMinted: 100n, assetsPaid: 100n },
      slippageTolerance: 10n ** 18n,
    };
    expect(
      checkSlippage({
        limits,
        observed: { sharesMinted: 0n, assetsPaid: 200n },
        context,
      }),
    ).toEqual(limits);
    expect(() =>
      checkSlippage({
        limits,
        observed: { sharesMinted: 0n, assetsPaid: 201n },
        context,
      }),
    ).toThrow(ConsumerLimitViolationError);
  });
});
