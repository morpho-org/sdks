import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  MidnightMarketLiquidationCursorNotEnabledError,
  MidnightMarketLltvNotEnabledError,
  MidnightMarketMaturityTooFarError,
  MidnightMarketOracleWithoutCodeError,
  MidnightOfferCallbackNotSupportedError,
  MidnightOfferContinuousFeeCapBelowMarketFeeError,
  MidnightOfferExpiredError,
  MidnightOfferExpiryAfterMaturityError,
  MidnightOfferGroupConsumedError,
  MidnightOfferNoCreditError,
  MidnightOfferNoDebtError,
  MidnightOfferRateBoundUnreachableError,
  MidnightOfferTickSpacingError,
  MidnightOfferZeroPriceSellError,
} from "./midnightPublicationError.js";

const marketId = `0x${"11".repeat(32)}` as const;
const group = `0x${"22".repeat(32)}` as const;
const cases = [
  [
    "MidnightOfferExpiredError",
    new MidnightOfferExpiredError({ index: 1, expiry: 2n, now: 3n }),
  ],
  [
    "MidnightOfferExpiryAfterMaturityError",
    new MidnightOfferExpiryAfterMaturityError({
      index: 1,
      expiry: 4n,
      maturity: 3n,
    }),
  ],
  [
    "MidnightOfferGroupConsumedError",
    new MidnightOfferGroupConsumedError({ index: 1, group, consumed: 5n }),
  ],
  [
    "MidnightOfferTickSpacingError",
    new MidnightOfferTickSpacingError({
      index: 1,
      tick: 5n,
      tickSpacing: 4,
    }),
  ],
  [
    "MidnightOfferContinuousFeeCapBelowMarketFeeError",
    new MidnightOfferContinuousFeeCapBelowMarketFeeError({
      index: 1,
      marketId,
      continuousFeeCap: 0n,
      continuousFee: 1n,
    }),
  ],
  [
    "MidnightOfferZeroPriceSellError",
    new MidnightOfferZeroPriceSellError({ index: 1 }),
  ],
  [
    "MidnightOfferRateBoundUnreachableError",
    new MidnightOfferRateBoundUnreachableError({
      index: 1,
      rate: 2n,
      tick: 3n,
    }),
  ],
  [
    "MidnightOfferNoDebtError",
    new MidnightOfferNoDebtError({ index: 1, marketId }),
  ],
  [
    "MidnightOfferNoCreditError",
    new MidnightOfferNoCreditError({ index: 1, marketId }),
  ],
  [
    "MidnightMarketMaturityTooFarError",
    new MidnightMarketMaturityTooFarError({
      index: 1,
      maturity: 5n,
      maxMaturity: 4n,
    }),
  ],
  [
    "MidnightMarketLltvNotEnabledError",
    new MidnightMarketLltvNotEnabledError({ index: 1, lltv: 5n }),
  ],
  [
    "MidnightMarketLiquidationCursorNotEnabledError",
    new MidnightMarketLiquidationCursorNotEnabledError({
      index: 1,
      liquidationCursor: 5n,
    }),
  ],
  [
    "MidnightMarketOracleWithoutCodeError",
    new MidnightMarketOracleWithoutCodeError({
      index: 1,
      oracle: zeroAddress,
    }),
  ],
  [
    "MidnightOfferCallbackNotSupportedError",
    new MidnightOfferCallbackNotSupportedError({
      index: 1,
      callback: zeroAddress,
    }),
  ],
] as const;

describe("Midnight maker publication errors", () => {
  test.each(cases)(
    "%s has a stable name and instruction message",
    (name, error) => {
      expect(error.name).toBe(name);
      expect(error.message).toMatch(/Choose|Use|Rebuild/);
      expect(error.message).toContain('"1"');
    },
  );

  test("recommends rebuilding a consumed group with a fresh group", () => {
    const error = new MidnightOfferGroupConsumedError({
      index: 1,
      group,
      consumed: 5n,
    });

    expect(error.message).toContain("Rebuild the offers with a fresh group.");
    expect(error.message).not.toContain("cancel it before publishing");
  });
});
