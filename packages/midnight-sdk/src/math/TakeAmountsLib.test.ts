import { MathLib } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { baseOffer } from "../__test__/fixtures.js";
import { MAX_TICK } from "../constants.js";
import { DivisionByZeroError } from "../errors.js";
import { ConsumableUnitsLib } from "./ConsumableUnitsLib.js";
import { TakeAmountsLib } from "./TakeAmountsLib.js";
import { TickLib } from "./TickLib.js";

describe("TakeAmountsLib.buyerAssetsToUnits", () => {
  test("behavior: buy offers round borrower max units up", () => {
    const offer = baseOffer({ buy: true, tick: 5_000n });
    const price = TickLib.tickToPrice(offer.tick);

    expect(
      TakeAmountsLib.buyerAssetsToUnits({
        offer,
        targetBuyerAssets: 123n,
        settlementFee: 0n,
        now: 0n,
      }),
    ).toBe(TakeAmountsLib.toUnits({ assets: 123n, price, rounding: "Up" }));
  });

  test("behavior: sell offers round lender min units down", () => {
    const offer = baseOffer({ buy: false, tick: 5_000n });
    const price = TickLib.tickToPrice(offer.tick);

    expect(
      TakeAmountsLib.buyerAssetsToUnits({
        offer,
        targetBuyerAssets: 123n,
        settlementFee: 0n,
        now: 0n,
      }),
    ).toBe(TakeAmountsLib.toUnits({ assets: 123n, price, rounding: "Down" }));
  });

  test("error: DivisionByZeroError", () => {
    expect(() =>
      TakeAmountsLib.buyerAssetsToUnits({
        offer: baseOffer({ buy: false, tick: 0n }),
        targetBuyerAssets: 123n,
        settlementFee: 0n,
        now: 0n,
      }),
    ).toThrow(DivisionByZeroError);
  });
});

describe("TakeAmountsLib.sellerAssetsToUnits", () => {
  test("error: DivisionByZeroError", () => {
    const offer = baseOffer({ buy: true, tick: 2n });

    expect(() =>
      TakeAmountsLib.sellerAssetsToUnits({
        offer,
        targetSellerAssets: 123n,
        settlementFee: TickLib.tickToPrice(offer.tick),
        now: 0n,
      }),
    ).toThrow(DivisionByZeroError);
  });
});

describe("TakeAmountsLib.toUnits", () => {
  test("behavior: rounded-up units are at most one above rounded-down units", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: MathLib.WAD * MathLib.WAD }),
        fc.bigInt({ min: 1n, max: MathLib.WAD }),
        (assets, price) => {
          const down = TakeAmountsLib.toUnits({
            assets,
            price,
            rounding: "Down",
          });
          const up = TakeAmountsLib.toUnits({
            assets,
            price,
            rounding: "Up",
          });

          expect(up === down || up === down + 1n).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("TakeAmountsLib.toUnitsAtTick", () => {
  test("behavior: matches generic conversion at the tick price", () => {
    fc.assert(
      fc.property(
        fc.record({
          assets: fc.bigInt({ min: 0n, max: MathLib.WAD * MathLib.WAD }),
          tick: fc.bigInt({ min: 2n, max: MAX_TICK }),
          rounding: fc.constantFrom("Up" as const, "Down" as const),
        }),
        ({ assets, tick, rounding }) => {
          expect(TakeAmountsLib.toUnitsAtTick({ assets, tick, rounding })).toBe(
            TakeAmountsLib.toUnits({
              assets,
              price: TickLib.tickToPrice(tick),
              rounding,
            }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("ConsumableUnitsLib.consumableUnits", () => {
  test("default", () => {
    expect(
      ConsumableUnitsLib.consumableUnits({
        offer: baseOffer({ maxUnits: 100n }),
        consumed: 40n,
        settlementFee: 0n,
        now: 0n,
      }),
    ).toBe(60n);
  });
});
