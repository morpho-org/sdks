import { Time } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { formatUnits } from "viem";
import { describe, expect, test } from "vitest";
import { InvalidOfferParameterError } from "../errors.js";
import { TickLib } from "../math/index.js";
import { OfferChainUtils } from "./OfferChainUtils.js";

const YEAR = Time.s.from.y(1n);
const YEAR_NUMBER = Number(YEAR);
const DRIFT = 0.1;
const RATE_EPSILON = 0.00001;
const NOW = 1_767_225_600n;
const MATURITY = NOW + YEAR;
const MAX_EXPIRY = OfferChainUtils.getMaxFixedRateOfferChainEndTimestamp({
  maturityTimestamp: MATURITY,
  chainStartTimestamp: NOW,
});

const defaultParams = {
  targetRate: 0.05,
  tickSpacing: 4n,
  maturityTimestamp: MATURITY,
  chainStartTimestamp: NOW,
  chainEndTimestamp: MAX_EXPIRY,
} as const;

const chainBuilders = {
  borrow: OfferChainUtils.buildBorrowFixedRateOfferChain,
  lend: OfferChainUtils.buildLendFixedRateOfferChain,
} as const;

describe("OfferChainUtils fixed-rate offer-chain builders", () => {
  test("default", () => {
    const chain = OfferChainUtils.buildLendFixedRateOfferChain(defaultParams);

    expect(chain.length).toBeGreaterThan(0);
    expect(chain).toStrictEqual(
      OfferChainUtils.buildLendFixedRateOfferChain(defaultParams),
    );
    for (const [index, leg] of chain.entries()) {
      expect(leg.tick % defaultParams.tickSpacing).toBe(0n);
      expect(leg.expiryTimestamp).toBeGreaterThan(leg.startTimestamp);
      if (index > 0) {
        expect(leg.startTimestamp).toBe(chain[index - 1]!.expiryTimestamp);
        expect(leg.tick).toBeGreaterThan(chain[index - 1]!.tick);
      }
    }
  });

  test.each([
    "borrow",
    "lend",
  ] as const)("behavior: recovers target rate at every %s display edge", (side) => {
    const chain = chainBuilders[side](defaultParams);

    for (const leg of chain) {
      const displayTimestamp =
        side === "borrow" ? leg.expiryTimestamp : leg.startTimestamp;
      const displayRate = rateAt({
        tick: leg.tick,
        maturityTimestamp: defaultParams.maturityTimestamp,
        timestamp: displayTimestamp,
      });

      expect(Math.abs(displayRate - defaultParams.targetRate)).toBeLessThan(
        defaultParams.targetRate * 0.005 + 0.00001,
      );
    }
  });

  test.each([
    "borrow",
    "lend",
  ] as const)("behavior: keeps %s rates on the maker-favorable side", (side) => {
    const chain = chainBuilders[side](defaultParams);

    for (const leg of chain) {
      const startRate = rateAt({
        tick: leg.tick,
        maturityTimestamp: defaultParams.maturityTimestamp,
        timestamp: leg.startTimestamp,
      });
      const expiryRate = rateAt({
        tick: leg.tick,
        maturityTimestamp: defaultParams.maturityTimestamp,
        timestamp: leg.expiryTimestamp,
      });

      if (side === "borrow") {
        expect(startRate).toBeGreaterThanOrEqual(
          defaultParams.targetRate * (1 - DRIFT) - RATE_EPSILON,
        );
        expect(startRate).toBeLessThanOrEqual(
          defaultParams.targetRate + RATE_EPSILON,
        );
        expect(expiryRate).toBeLessThanOrEqual(
          defaultParams.targetRate + RATE_EPSILON,
        );
      } else {
        expect(startRate).toBeGreaterThanOrEqual(
          defaultParams.targetRate - RATE_EPSILON,
        );
        expect(expiryRate).toBeGreaterThanOrEqual(
          defaultParams.targetRate - RATE_EPSILON,
        );
        expect(expiryRate).toBeLessThanOrEqual(
          defaultParams.targetRate * (1 + DRIFT) + RATE_EPSILON,
        );
      }
    }
  });

  test("behavior: returns an empty chain when the grid cannot represent the rate", () => {
    expect(
      OfferChainUtils.buildLendFixedRateOfferChain({
        ...defaultParams,
        targetRate: 0.0001,
        chainStartTimestamp: MATURITY - 2n * Time.s.from.d(1n),
        chainEndTimestamp: MATURITY - Time.s.from.d(1n),
      }),
    ).toStrictEqual([]);
  });

  test("behavior: accepts tick spacing that does not divide max tick", () => {
    const chain = OfferChainUtils.buildLendFixedRateOfferChain({
      ...defaultParams,
      tickSpacing: 64n,
    });

    for (const leg of chain) {
      expect(leg.tick % 64n).toBe(0n);
    }
  });

  test("error: InvalidOfferParameterError", () => {
    expect(() =>
      OfferChainUtils.buildLendFixedRateOfferChain({
        ...defaultParams,
        targetRate: 0,
      }),
    ).toThrow(InvalidOfferParameterError);
    expect(() =>
      OfferChainUtils.buildLendFixedRateOfferChain({
        ...defaultParams,
        chainEndTimestamp: MAX_EXPIRY + 1n,
      }),
    ).toThrow(InvalidOfferParameterError);
  });

  test("behavior: property-based chain invariants", () => {
    fc.assert(
      fc.property(
        fc.record({
          side: fc.constantFrom("borrow", "lend"),
          targetRate: fc.double({
            min: 0.001,
            max: 0.5,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          tickSpacing: fc.integer({ min: 1, max: 96 }),
          startOffset: fc.integer({
            min: 0,
            max: Number(Time.s.from.d(30n)),
          }),
          ttm: fc.integer({
            min: Number(Time.s.from.d(30n)),
            max: Number(YEAR),
          }),
        }),
        (input) => {
          const chainStartTimestamp = NOW + BigInt(input.startOffset);
          const maturityTimestamp = chainStartTimestamp + BigInt(input.ttm);
          const chainEndTimestamp =
            OfferChainUtils.getMaxFixedRateOfferChainEndTimestamp({
              maturityTimestamp,
              chainStartTimestamp,
            });
          const chain = chainBuilders[input.side]({
            targetRate: input.targetRate,
            tickSpacing: BigInt(input.tickSpacing),
            maturityTimestamp,
            chainStartTimestamp,
            chainEndTimestamp,
          });

          for (const [index, leg] of chain.entries()) {
            expect(leg.tick % BigInt(input.tickSpacing)).toBe(0n);
            if (input.side === "borrow") {
              expect(leg.startTimestamp).toBeGreaterThanOrEqual(
                chainStartTimestamp,
              );
            } else {
              expect(leg.expiryTimestamp).toBeGreaterThan(chainStartTimestamp);
            }
            expect(leg.expiryTimestamp).toBeLessThanOrEqual(chainEndTimestamp);
            expect(leg.expiryTimestamp).toBeGreaterThan(leg.startTimestamp);
            if (index > 0) {
              expect(leg.startTimestamp).toBe(
                chain[index - 1]!.expiryTimestamp,
              );
              expect(leg.tick).toBeGreaterThan(chain[index - 1]!.tick);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("OfferChainUtils.getMaxFixedRateOfferChainEndTimestamp", () => {
  test("default", () => {
    expect(MAX_EXPIRY).toBe(NOW + ((MATURITY - NOW) * 75n) / 100n);
  });

  test("error: InvalidOfferParameterError", () => {
    expect(() =>
      OfferChainUtils.getMaxFixedRateOfferChainEndTimestamp({
        maturityTimestamp: NOW,
        chainStartTimestamp: NOW,
      }),
    ).toThrow(InvalidOfferParameterError);
  });
});

function rateAt(params: {
  readonly tick: bigint;
  readonly maturityTimestamp: bigint;
  readonly timestamp: bigint;
}) {
  const price = Number(formatUnits(TickLib.tickToPrice(params.tick), 18));
  const tau = Number(params.maturityTimestamp - params.timestamp) / YEAR_NUMBER;

  return (1 / price) ** (1 / tau) - 1;
}
