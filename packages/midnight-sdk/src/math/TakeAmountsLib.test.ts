import { MathLib, NegativeValueError } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { baseOffer } from "../__test__/fixtures.js";
import { MAX_TICK } from "../constants.js";
import {
  DivisionByZeroError,
  PriceGreaterThanOneError,
  SettlementFeeExceedsPriceError,
} from "../errors.js";
import { ConsumableUnitsLib } from "./ConsumableUnitsLib.js";
import { TakeAmountsLib } from "./TakeAmountsLib.js";
import { TickLib } from "./TickLib.js";

describe("TakeAmountsLib.prices", () => {
  test("default: prices", () => {
    const prices = TakeAmountsLib.prices({
      offer: baseOffer({ buy: true, tick: MAX_TICK }),
      settlementFee: 1n,
    });

    expect(prices).toEqual({
      buyerPrice: MathLib.WAD,
      sellerPrice: MathLib.WAD - 1n,
    });
  });

  test("error: prices NegativeValueError", () => {
    expect(() =>
      TakeAmountsLib.prices({
        offer: baseOffer(),
        settlementFee: -1n,
      }),
    ).toThrow(NegativeValueError);
  });

  test("error: SettlementFeeExceedsPriceError", () => {
    const offer = baseOffer({ buy: true, tick: 2n });

    expect(() =>
      TakeAmountsLib.prices({
        offer,
        settlementFee: TickLib.tickToPrice(offer.tick) + 1n,
      }),
    ).toThrow(SettlementFeeExceedsPriceError);
  });
});

describe("TakeAmountsLib.buyerAssetsToUnits", () => {
  test("behavior: buy offers round borrower max units up", () => {
    const offer = baseOffer({ buy: true, tick: 5_000n });
    const price = TickLib.tickToPrice(offer.tick);

    expect(
      TakeAmountsLib.buyerAssetsToUnits({
        offer,
        targetBuyerAssets: 123n,
        settlementFee: 0n,
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
      }),
    ).toBe(TakeAmountsLib.toUnits({ assets: 123n, price, rounding: "Down" }));
  });

  test("behavior: sell offers include settlement fee in buyer price", () => {
    const offer = baseOffer({ buy: false, tick: 5_000n });
    const settlementFee = 1_000000000000n;
    const price = TickLib.tickToPrice(offer.tick) + settlementFee;

    expect(
      TakeAmountsLib.buyerAssetsToUnits({
        offer,
        targetBuyerAssets: 123n,
        settlementFee,
      }),
    ).toBe(TakeAmountsLib.toUnits({ assets: 123n, price, rounding: "Down" }));
  });

  test("behavior: returned units forward to the reachable target buyer assets", () => {
    const settlementFee = 1_000000000000n;
    const cases = [
      baseOffer({ buy: true, tick: 5_000n }),
      baseOffer({ buy: false, tick: 5_000n }),
    ];

    for (const offer of cases) {
      const { buyerPrice } = TakeAmountsLib.prices({
        offer,
        settlementFee,
      });
      const targetBuyerAssets = MathLib.mulDiv(
        123_456789000000000000n,
        buyerPrice,
        MathLib.WAD,
        offer.buy ? "Down" : "Up",
      );
      const units = TakeAmountsLib.buyerAssetsToUnits({
        offer,
        targetBuyerAssets,
        settlementFee,
      });

      expect(
        MathLib.mulDiv(
          units,
          buyerPrice,
          MathLib.WAD,
          offer.buy ? "Down" : "Up",
        ),
      ).toBe(targetBuyerAssets);
    }
  });

  test("error: NegativeValueError", () => {
    const offer = baseOffer();

    expect(() =>
      TakeAmountsLib.buyerAssetsToUnits({
        offer,
        targetBuyerAssets: -1n,
        settlementFee: 0n,
      }),
    ).toThrow(NegativeValueError);
    expect(() =>
      TakeAmountsLib.buyerAssetsToUnits({
        offer,
        targetBuyerAssets: 123n,
        settlementFee: -1n,
      }),
    ).toThrow(NegativeValueError);
  });

  test("error: DivisionByZeroError", () => {
    expect(() =>
      TakeAmountsLib.buyerAssetsToUnits({
        offer: baseOffer({ buy: false, tick: 0n }),
        targetBuyerAssets: 123n,
        settlementFee: 0n,
      }),
    ).toThrow(DivisionByZeroError);
  });

  test("error: SettlementFeeExceedsPriceError", () => {
    const offer = baseOffer({ buy: true, tick: 2n });

    expect(() =>
      TakeAmountsLib.buyerAssetsToUnits({
        offer,
        targetBuyerAssets: 123n,
        settlementFee: TickLib.tickToPrice(offer.tick) + 1n,
      }),
    ).toThrow(SettlementFeeExceedsPriceError);
  });

  test("error: PriceGreaterThanOneError", () => {
    expect(() =>
      TakeAmountsLib.buyerAssetsToUnits({
        offer: baseOffer({ buy: false, tick: MAX_TICK }),
        targetBuyerAssets: 123n,
        settlementFee: 1n,
      }),
    ).toThrow(PriceGreaterThanOneError);
  });
});

describe("TakeAmountsLib.sellerAssetsToUnits", () => {
  test("behavior: buy offers round seller units up after settlement fee", () => {
    const offer = baseOffer({ buy: true, tick: 5_000n });
    const settlementFee = 1_000000000000n;
    const price = TickLib.tickToPrice(offer.tick) - settlementFee;

    expect(
      TakeAmountsLib.sellerAssetsToUnits({
        offer,
        targetSellerAssets: 123n,
        settlementFee,
      }),
    ).toBe(TakeAmountsLib.toUnits({ assets: 123n, price, rounding: "Up" }));
  });

  test("behavior: sell offers round seller units down", () => {
    const offer = baseOffer({ buy: false, tick: 5_000n });
    const price = TickLib.tickToPrice(offer.tick);

    expect(
      TakeAmountsLib.sellerAssetsToUnits({
        offer,
        targetSellerAssets: 123n,
        settlementFee: 1_000000000000n,
      }),
    ).toBe(TakeAmountsLib.toUnits({ assets: 123n, price, rounding: "Down" }));
  });

  test("behavior: returned units forward to the reachable target seller assets", () => {
    const settlementFee = 1_000000000000n;
    const cases = [
      baseOffer({ buy: true, tick: 5_000n }),
      baseOffer({ buy: false, tick: 5_000n }),
    ];

    for (const offer of cases) {
      const { sellerPrice } = TakeAmountsLib.prices({
        offer,
        settlementFee,
      });
      const targetSellerAssets = MathLib.mulDiv(
        123_456789000000000000n,
        sellerPrice,
        MathLib.WAD,
        offer.buy ? "Down" : "Up",
      );
      const units = TakeAmountsLib.sellerAssetsToUnits({
        offer,
        targetSellerAssets,
        settlementFee,
      });

      expect(
        MathLib.mulDiv(
          units,
          sellerPrice,
          MathLib.WAD,
          offer.buy ? "Down" : "Up",
        ),
      ).toBe(targetSellerAssets);
    }
  });

  test("error: DivisionByZeroError", () => {
    const offer = baseOffer({ buy: true, tick: 2n });

    expect(() =>
      TakeAmountsLib.sellerAssetsToUnits({
        offer,
        targetSellerAssets: 123n,
        settlementFee: TickLib.tickToPrice(offer.tick),
      }),
    ).toThrow(DivisionByZeroError);
  });

  test("error: NegativeValueError", () => {
    const offer = baseOffer();

    expect(() =>
      TakeAmountsLib.sellerAssetsToUnits({
        offer,
        targetSellerAssets: -1n,
        settlementFee: 0n,
      }),
    ).toThrow(NegativeValueError);
    expect(() =>
      TakeAmountsLib.sellerAssetsToUnits({
        offer,
        targetSellerAssets: 123n,
        settlementFee: -1n,
      }),
    ).toThrow(NegativeValueError);
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

  test("error: NegativeValueError", () => {
    expect(() =>
      TakeAmountsLib.toUnits({
        assets: -1n,
        price: MathLib.WAD,
        rounding: "Down",
      }),
    ).toThrow(NegativeValueError);
    expect(() =>
      TakeAmountsLib.toUnits({
        assets: 1n,
        price: -1n,
        rounding: "Down",
      }),
    ).toThrow(NegativeValueError);
  });

  test("error: DivisionByZeroError", () => {
    expect(() =>
      TakeAmountsLib.toUnits({
        assets: 1n,
        price: 0n,
        rounding: "Down",
      }),
    ).toThrow(DivisionByZeroError);
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
      }),
    ).toBe(60n);
  });

  test("behavior: max units use zero-floor subtraction", () => {
    expect(
      ConsumableUnitsLib.consumableUnits({
        offer: baseOffer({ maxUnits: 100n }),
        consumed: 120n,
        settlementFee: MathLib.WAD,
      }),
    ).toBe(0n);
  });

  test("behavior: buy max assets convert buyer assets", () => {
    const offer = baseOffer({ buy: true, maxUnits: 0n, maxAssets: 123n });

    expect(
      ConsumableUnitsLib.consumableUnits({
        offer,
        consumed: 23n,
        settlementFee: 0n,
      }),
    ).toBe(
      TakeAmountsLib.buyerAssetsToUnits({
        offer,
        targetBuyerAssets: 100n,
        settlementFee: 0n,
      }),
    );
  });

  test("behavior: sell max assets convert seller assets", () => {
    const offer = baseOffer({
      buy: false,
      maxUnits: 0n,
      maxAssets: 123n,
    });

    expect(
      ConsumableUnitsLib.consumableUnits({
        offer,
        consumed: 23n,
        settlementFee: 0n,
      }),
    ).toBe(
      TakeAmountsLib.sellerAssetsToUnits({
        offer,
        targetSellerAssets: 100n,
        settlementFee: 0n,
      }),
    );
  });

  test("behavior: max assets use zero-floor subtraction", () => {
    expect(
      ConsumableUnitsLib.consumableUnits({
        offer: baseOffer({
          buy: true,
          tick: MAX_TICK,
          maxUnits: 0n,
          maxAssets: 100n,
        }),
        consumed: 120n,
        settlementFee: 0n,
      }),
    ).toBe(0n);
  });

  test("error: NegativeValueError", () => {
    expect(() =>
      ConsumableUnitsLib.consumableUnits({
        offer: baseOffer({ maxUnits: 100n }),
        consumed: -1n,
        settlementFee: 0n,
      }),
    ).toThrow(NegativeValueError);
    expect(() =>
      ConsumableUnitsLib.consumableUnits({
        offer: baseOffer({ maxUnits: -1n }),
        consumed: 0n,
        settlementFee: 0n,
      }),
    ).toThrow(NegativeValueError);
  });

  test("error: DivisionByZeroError", () => {
    expect(() =>
      ConsumableUnitsLib.consumableUnits({
        offer: baseOffer({ buy: true, tick: 0n, maxUnits: 0n }),
        consumed: 0n,
        settlementFee: 0n,
      }),
    ).toThrow(DivisionByZeroError);
  });

  test("error: SettlementFeeExceedsPriceError", () => {
    const offer = baseOffer({ buy: true, tick: 2n, maxUnits: 0n });

    expect(() =>
      ConsumableUnitsLib.consumableUnits({
        offer,
        consumed: 0n,
        settlementFee: TickLib.tickToPrice(offer.tick) + 1n,
      }),
    ).toThrow(SettlementFeeExceedsPriceError);
  });
});
