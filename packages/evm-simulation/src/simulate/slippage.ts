import { deepFreeze, MathLib } from "@morpho-org/morpho-ts";
import {
  ConsumerLimitViolationError,
  MissingVerificationEvidenceError,
  type SimulationVerificationContext,
} from "../errors.js";
import type { SlippageLimits, SlippageQuote } from "../limits.js";

/**
 * Compare observed amounts against the caller's quote and percentage tolerance.
 * Minimum outputs round up and maximum inputs round down, so rounding never
 * permits a deviation greater than the requested percentage.
 * @param params - Parsed quote/tolerance, matching observations, and error context.
 * @returns The checked quote and tolerance, deep-frozen.
 * @throws {ConsumerLimitViolationError} When adverse slippage exceeds tolerance.
 * @throws {MissingVerificationEvidenceError} When a quoted amount has no observation.
 * @internal
 */
export function checkSlippage(params: {
  readonly limits: SlippageLimits;
  readonly observed: SlippageQuote;
  readonly context: SimulationVerificationContext;
  readonly debtShares?: boolean;
}): SlippageLimits {
  const { limits, observed, context, debtShares = false } = params;
  const quote: { -readonly [K in keyof SlippageQuote]: SlippageQuote[K] } = {};
  for (const [field, output] of [
    ["assetsReceived", true],
    ["sharesMinted", !debtShares],
    ["assetsPaid", false],
    ["sharesBurned", debtShares],
  ] as const) {
    const expected = limits.quote[field];
    if (expected === undefined) continue;
    const amount = observed[field];
    if (amount === undefined) {
      throw new MissingVerificationEvidenceError(
        `Missing observation for "${field}". Supply the matching asset or position.`,
        { context: { ...context, field } },
      );
    }
    const bound = output
      ? MathLib.wMulUp(expected, MathLib.WAD - limits.slippageTolerance)
      : MathLib.wMulDown(expected, MathLib.WAD + limits.slippageTolerance);
    if (output ? amount < bound : amount > bound) {
      throw new ConsumerLimitViolationError(
        `Slippage for "${field}" exceeds tolerance "${limits.slippageTolerance}" against quote "${expected}"; allowed bound "${bound}", got "${amount}". Adjust the transaction or tolerance.`,
        { context: { ...context, field, expected: bound, observed: amount } },
      );
    }
    quote[field] = expected;
  }
  return deepFreeze({ quote, slippageTolerance: limits.slippageTolerance });
}
