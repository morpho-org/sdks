import { fc, test } from "@fast-check/vitest";
import { MathLib } from "@morpho-org/morpho-ts";
import { maxUint64, maxUint256, zeroAddress } from "viem";
import { describe, expect } from "vitest";

import { MAX_TICK } from "../constants.js";
import { RateRatifierV1BoundOverflowError } from "../errors.js";
// TickLib.tickToPrice is used as the offer-price reference here: it has its own
// exact-port property test in ../math/TickLib.property.test.ts.
import { TickLib } from "../math/TickLib.js";
import { RateRatifierV1 } from "./RateRatifierV1.js";

const WAD = MathLib.WAD;

// Midnight src/ratifiers/RateRatifierV1.sol isRatified bound, including the
// checked-overflow reverts.
// biome-ignore lint/complexity/useMaxParams: Mirrors the contract's bound signature.
const refBound = (
  rate: bigint,
  timeToMaturity: bigint,
  buy: boolean,
): bigint | "overflow" => {
  const product = rate * timeToMaturity;
  if (product > maxUint256) return "overflow";
  const denominator = WAD + product;
  if (denominator > maxUint256) return "overflow";
  if (!buy && WAD * WAD + denominator - 1n > maxUint256) return "overflow";

  return buy
    ? (WAD * WAD) / denominator
    : (WAD * WAD + denominator - 1n) / denominator;
};

const rateArb = fc.oneof(
  fc.constantFrom(0n, 1n, maxUint256),
  fc.bigInt({ min: 0n, max: 10n * WAD }),
  fc.bigInt({ min: 0n, max: maxUint256 }),
);
const ttmArb = fc.oneof(
  fc.constantFrom(0n, 1n, maxUint64),
  fc.bigInt({ min: 0n, max: 1_000_000n }),
  fc.bigInt({ min: 0n, max: maxUint64 }),
);
const tickArb = fc.oneof(
  fc.constantFrom(0n, MAX_TICK - 1n, MAX_TICK),
  fc.bigInt({ min: 0n, max: MAX_TICK }),
);

// Midnight src/ratifiers/RateRatifierV1.sol isRatified price bound
describe("RateRatifierV1.priceBound", () => {
  test("default", () => {
    expect(
      RateRatifierV1.priceBound({ rate: 0n, timeToMaturity: 0n, buy: true }),
    ).toBe(WAD);
  });

  test.prop(
    [fc.record({ rate: rateArb, timeToMaturity: ttmArb, buy: fc.boolean() })],
    { numRuns: 1000 },
  )(
    "behavior: equals the Solidity bound with checked-overflow reverts mapped to RateRatifierV1BoundOverflowError",
    ({ rate, timeToMaturity, buy }) => {
      const expected = refBound(rate, timeToMaturity, buy);

      if (expected === "overflow") {
        expect(() =>
          RateRatifierV1.priceBound({ rate, timeToMaturity, buy }),
        ).toThrow(RateRatifierV1BoundOverflowError);
        return;
      }

      const bound = RateRatifierV1.priceBound({ rate, timeToMaturity, buy });
      expect(bound).toBe(expected);
      expect(bound).toBeLessThanOrEqual(WAD);

      const other = refBound(rate, timeToMaturity, !buy);
      if (other !== "overflow") {
        const otherBound = RateRatifierV1.priceBound({
          rate,
          timeToMaturity,
          buy: !buy,
        });
        const [lo, hi] = buy ? [bound, otherBound] : [otherBound, bound];
        // Sell bound minus buy bound is in {0, 1}.
        expect(hi - lo === 0n || hi - lo === 1n).toBeTruthy();
      }
    },
  );

  test.prop(
    [
      fc.record({
        a: rateArb,
        b: rateArb,
        timeToMaturity: ttmArb,
        buy: fc.boolean(),
      }),
    ],
    { numRuns: 1000 },
  )("behavior: non-increasing in rate", ({ a, b, timeToMaturity, buy }) => {
    const [r1, r2] = a <= b ? [a, b] : [b, a];
    const b1 = refBound(r1, timeToMaturity, buy);
    const b2 = refBound(r2, timeToMaturity, buy);
    fc.pre(b1 !== "overflow" && b2 !== "overflow");

    expect(
      RateRatifierV1.priceBound({ rate: r1, timeToMaturity, buy }),
    ).toBeGreaterThanOrEqual(
      RateRatifierV1.priceBound({ rate: r2, timeToMaturity, buy }),
    );
  });

  test.prop(
    [
      fc.record({
        rate: rateArb,
        a: ttmArb,
        b: ttmArb,
        buy: fc.boolean(),
      }),
    ],
    { numRuns: 1000 },
  )("behavior: non-increasing in time to maturity", ({ rate, a, b, buy }) => {
    const [t1, t2] = a <= b ? [a, b] : [b, a];
    const b1 = refBound(rate, t1, buy);
    const b2 = refBound(rate, t2, buy);
    fc.pre(b1 !== "overflow" && b2 !== "overflow");

    expect(
      RateRatifierV1.priceBound({ rate, timeToMaturity: t1, buy }),
    ).toBeGreaterThanOrEqual(
      RateRatifierV1.priceBound({ rate, timeToMaturity: t2, buy }),
    );
  });
});

// Midnight src/ratifiers/RateRatifierV1.sol isRatified predicate
describe("RateRatifierV1.isPriceAcceptable", () => {
  test("default", () => {
    expect(
      RateRatifierV1.isPriceAcceptable({
        offer: {
          tick: 0n,
          buy: true,
          market: {
            chainId: 8453,
            midnight: "0x0000000000000000000000000000000000001000",
            loanToken: "0x0000000000000000000000000000000000006000",
            collateralParams: [
              {
                token: "0x0000000000000000000000000000000000007000",
                lltv: 770_000_000_000_000_000n,
                liquidationCursor: 250_000_000_000_000_000n,
                oracle: "0x0000000000000000000000000000000000008000",
              },
            ],
            maturity: 2_000n,
            rcfThreshold: 0n,
            enterGate: zeroAddress,
            liquidatorGate: zeroAddress,
          },
        },
        rate: 0n,
        timestamp: 0n,
      }),
    ).toBe(true);
  });

  test.prop(
    [
      fc.record({
        tick: tickArb,
        buy: fc.boolean(),
        rate: rateArb,
        maturity: fc.bigInt({ min: 0n, max: 2_000_000n }),
        timestamp: fc.bigInt({ min: 0n, max: 2_000_000n }),
      }),
    ],
    {
      numRuns: 1000,
      examples: [
        [
          {
            tick: MAX_TICK,
            buy: true,
            rate: 0n,
            maturity: 0n,
            timestamp: 0n,
          },
        ],
        [
          {
            tick: MAX_TICK,
            buy: false,
            rate: 0n,
            maturity: 0n,
            timestamp: 0n,
          },
        ],
        [
          {
            tick: 0n,
            buy: true,
            rate: 249999999999999999750000000000000001n,
            maturity: 4n,
            timestamp: 0n,
          },
        ],
      ],
    },
  )(
    "behavior: equals the contract predicate, with overflowed bounds unacceptable",
    ({ tick, buy, rate, maturity, timestamp }) => {
      const timeToMaturity = maturity > timestamp ? maturity - timestamp : 0n;
      const bound = refBound(rate, timeToMaturity, buy);
      const offerPrice = TickLib.tickToPrice(tick);
      const expected =
        bound === "overflow"
          ? false
          : buy
            ? offerPrice <= bound
            : offerPrice >= bound;

      expect(
        RateRatifierV1.isPriceAcceptable({
          offer: {
            tick,
            buy,
            market: {
              chainId: 8453,
              midnight: "0x0000000000000000000000000000000000001000",
              loanToken: "0x0000000000000000000000000000000000006000",
              collateralParams: [
                {
                  token: "0x0000000000000000000000000000000000007000",
                  lltv: 770_000_000_000_000_000n,
                  liquidationCursor: 250_000_000_000_000_000n,
                  oracle: "0x0000000000000000000000000000000000008000",
                },
              ],
              maturity,
              rcfThreshold: 0n,
              enterGate: zeroAddress,
              liquidatorGate: zeroAddress,
            },
          },
          rate,
          timestamp,
        }),
      ).toBe(expected);
    },
  );
});
