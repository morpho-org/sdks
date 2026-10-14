import { fc, test } from "@fast-check/vitest";
import { MathLib, Time } from "@morpho-org/morpho-ts";
import { describe, expect } from "vitest";

import { MAX_TICK, PRICE_ROUNDING_STEP } from "../constants.js";
import { TickOutOfRangeError } from "../errors.js";
import { TickLib } from "./TickLib.js";

const WAD = MathLib.WAD;
const SCALE = 1_000000000000000000000000000000000000n;

// Reference constants, verbatim from Midnight TickLib.sol.
const LN_ONE_PLUS_DELTA = 4_987_541_511_039_073n;
const LN_2 = 693_147_180_559_945_309n;
const EXP_OFFSET = 322_611_214_989_459_870n;
const WEXP_DOMAIN = LN_ONE_PLUS_DELTA * (MAX_TICK / 2n);

const refWExp = (x: bigint): bigint => {
  if (x < 0n) return SCALE / refWExp(-x);

  const q = (x + EXP_OFFSET) / LN_2;
  const r = x - q * LN_2;
  const secondTerm = (r * r) / (2n * WAD);
  const thirdTerm = (secondTerm * r) / (3n * WAD);

  return (WAD + r + secondTerm + thirdTerm) << q;
};

const refDivHalfDown = (x: bigint, d: bigint) => (x + (d - 1n) / 2n) / d;

const refTickToPrice = (tick: bigint) =>
  refDivHalfDown(
    refDivHalfDown(
      SCALE,
      WAD + refWExp(LN_ONE_PLUS_DELTA * (MAX_TICK / 2n - tick)),
    ),
    PRICE_ROUNDING_STEP,
  ) * PRICE_ROUNDING_STEP;

const refPriceToTick = (price: bigint, spacing: bigint) => {
  let low = 0n;
  let high = MAX_TICK;
  while (low !== high) {
    const mid = (low + high) / 2n;
    if (refTickToPrice(mid) < price) low = mid + 1n;
    else high = mid;
  }

  return ((low + spacing - 1n) / spacing) * spacing;
};

const tickArb = fc.oneof(
  fc.constantFrom(
    0n,
    1n,
    2n,
    MAX_TICK / 2n - 1n,
    MAX_TICK / 2n,
    MAX_TICK / 2n + 1n,
    MAX_TICK - 1n,
    MAX_TICK,
  ),
  fc.bigInt({ min: 0n, max: MAX_TICK }),
);
const pricedTickArb = tickArb.filter((tick) => refTickToPrice(tick) > 0n);

const wExpInputArb = fc.oneof(
  fc.constantFrom(0n, 1n, -1n, WEXP_DOMAIN, -WEXP_DOMAIN),
  fc.bigInt({ min: -WEXP_DOMAIN, max: WEXP_DOMAIN }),
);

// Every spacing dividing MAX_TICK, derived from the constant.
const spacingArb = fc.constantFrom(
  ...Array.from({ length: Number(MAX_TICK) }, (_, i) => BigInt(i + 1)).filter(
    (s) => MAX_TICK % s === 0n,
  ),
);

const clampPrice = (price: bigint) =>
  price < 0n ? 0n : price > WAD ? WAD : price;

const priceArb = fc.oneof(
  fc.constantFrom(0n, 1n, PRICE_ROUNDING_STEP, WAD - 1n, WAD),
  fc.bigInt({ min: 0n, max: WAD }),
  fc
    .tuple(tickArb, fc.constantFrom(-1n, 0n, 1n))
    .map(([tick, delta]) => clampPrice(refTickToPrice(tick) + delta)),
);

// Midnight src/libraries/TickLib.sol wExp
describe("TickLib.wExp", () => {
  test("default", () => {
    expect(TickLib.wExp(0n)).toBe(WAD);
  });

  test.prop([wExpInputArb], { numRuns: 1000 })(
    "behavior: equals the Solidity wExp port on the tickToPrice domain",
    (x) => {
      expect(TickLib.wExp(x)).toBe(refWExp(x));
    },
  );
});

// Midnight src/libraries/TickLib.sol tickToPrice
describe("TickLib.tickToPrice", () => {
  test("default", () => {
    expect(TickLib.tickToPrice(MAX_TICK)).toBe(refTickToPrice(MAX_TICK));
    expect(TickLib.tickToPrice(MAX_TICK)).toBeLessThanOrEqual(WAD);
  });

  test.prop([tickArb], { numRuns: 1000 })(
    "behavior: equals the Solidity tickToPrice port, bounded and price-rounded",
    (tick) => {
      const price = TickLib.tickToPrice(tick);

      expect(price).toBe(refTickToPrice(tick));
      expect(price).toBeGreaterThanOrEqual(0n);
      expect(price).toBeLessThanOrEqual(WAD);
      expect(price % PRICE_ROUNDING_STEP).toBe(0n);
    },
  );

  test.prop([tickArb, tickArb], { numRuns: 1000 })(
    "behavior: non-decreasing in tick",
    (a, b) => {
      const [t1, t2] = a <= b ? [a, b] : [b, a];
      expect(TickLib.tickToPrice(t1)).toBeLessThanOrEqual(
        TickLib.tickToPrice(t2),
      );
    },
  );

  test.prop([fc.bigInt({ min: MAX_TICK + 1n, max: MAX_TICK + 1_000n })], {
    numRuns: 1000,
  })("error: TickOutOfRangeError above MAX_TICK", (tick) => {
    expect(() => TickLib.tickToPrice(tick)).toThrow(TickOutOfRangeError);
  });
});

// Midnight src/libraries/TickLib.sol priceToTick
describe("TickLib.priceToTick", () => {
  test("default", () => {
    expect(TickLib.priceToTick(WAD, 4n)).toBe(MAX_TICK);
  });

  test.prop([priceArb, spacingArb], { numRuns: 1000 })(
    "behavior: equals the Solidity priceToTick port and returns the lowest aligned tick",
    (price, spacing) => {
      const tick = TickLib.priceToTick(price, spacing);

      expect(tick).toBe(refPriceToTick(price, spacing));
      expect(tick % spacing).toBe(0n);
      expect(tick).toBeLessThanOrEqual(MAX_TICK);
      expect(refTickToPrice(tick)).toBeGreaterThanOrEqual(price);
      expect(
        tick === 0n || refTickToPrice(tick - spacing) < price,
      ).toBeTruthy();
    },
  );
});

// Midnight src/libraries/TickLib.sol tickToPrice + priceToTick (round trip)
describe("TickLib.tickToPrice/priceToTick round trip", () => {
  test("default", () => {
    const price = TickLib.tickToPrice(5_000n);
    expect(TickLib.priceToTick(price, 1n)).toBe(5_000n);
  });

  test.prop(
    [
      spacingArb.chain((spacing) =>
        fc.tuple(
          fc.constant(spacing),
          fc.bigInt({ min: 0n, max: MAX_TICK / spacing }),
        ),
      ),
    ],
    { numRuns: 1000 },
  )(
    "behavior: aligned tick -> price -> tick returns the lowest aligned tick at or below it with the same price",
    ([spacing, k]) => {
      const tick = k * spacing;
      const price = TickLib.tickToPrice(tick);
      const roundTrip = TickLib.priceToTick(price, spacing);

      expect(roundTrip).toBeLessThanOrEqual(tick);
      expect(TickLib.tickToPrice(roundTrip)).toBe(price);
    },
  );
});

// SDK-only rate helpers (no Solidity counterpart): tickToRate, rateToPrice, tickToApr.
describe("TickLib rate helpers", () => {
  test("default", () => {
    const rate = TickLib.tickToRate(MAX_TICK);
    expect(TickLib.rateToPrice(rate)).toBeLessThanOrEqual(
      TickLib.tickToPrice(MAX_TICK),
    );
    expect(TickLib.tickToApr(MAX_TICK, Time.s.from.y(1n))).toBe(rate);
  });

  test.prop([pricedTickArb, pricedTickArb], { numRuns: 1000 })(
    "behavior: tickToRate inverts tickToPrice within one wei and is non-increasing in tick",
    (a, b) => {
      const [t1, t2] = a <= b ? [a, b] : [b, a];
      const rate1 = TickLib.tickToRate(t1);
      const rate2 = TickLib.tickToRate(t2);
      const price1 = TickLib.tickToPrice(t1);

      expect(rate1).toBeGreaterThanOrEqual(0n);
      expect(TickLib.rateToPrice(rate1)).toBeGreaterThanOrEqual(price1 - 1n);
      expect(TickLib.rateToPrice(rate1)).toBeLessThanOrEqual(price1);
      expect(rate1).toBeGreaterThanOrEqual(rate2);
    },
  );

  test.prop(
    [
      fc.bigInt({ min: 0n, max: 10n * WAD }),
      fc.bigInt({ min: 0n, max: 10n * WAD }),
    ],
    { numRuns: 1000 },
  )("behavior: rateToPrice is non-increasing in rate", (a, b) => {
    const [r1, r2] = a <= b ? [a, b] : [b, a];
    expect(TickLib.rateToPrice(r1)).toBeGreaterThanOrEqual(
      TickLib.rateToPrice(r2),
    );
  });

  test.prop(
    [
      fc.record({
        tick: pricedTickArb,
        a: fc.bigInt({ min: 1n, max: 10n * Time.s.from.y(1n) }),
        b: fc.bigInt({ min: 1n, max: 10n * Time.s.from.y(1n) }),
      }),
    ],
    { numRuns: 1000 },
  )(
    "behavior: tickToApr is non-increasing in time to maturity and equals tickToRate at one year",
    ({ tick, a, b }) => {
      const [ttm1, ttm2] = a <= b ? [a, b] : [b, a];

      expect(TickLib.tickToApr(tick, ttm1)).toBeGreaterThanOrEqual(
        TickLib.tickToApr(tick, ttm2),
      );
      expect(TickLib.tickToApr(tick, Time.s.from.y(1n))).toBe(
        TickLib.tickToRate(tick),
      );
    },
  );
});
