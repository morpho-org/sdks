import { fc, test } from "@fast-check/vitest";
import { DivisionByZeroError, MathLib } from "@morpho-org/morpho-ts";
import { describe, expect } from "vitest";

import { MAX_SETTLEMENT_FEES, MAX_TICK } from "../constants.js";
import {
  PriceGreaterThanOneError,
  SettlementFeeExceedsPriceError,
} from "../errors.js";
import { TakeAmountsLib } from "./TakeAmountsLib.js";
// TickLib.tickToPrice is used as the offer-price reference here: it has its own
// exact-port property test in TickLib.property.test.ts.
import { TickLib } from "./TickLib.js";

const WAD = MathLib.WAD;
const MAX_FEE = MAX_SETTLEMENT_FEES[6];
const MAX_TARGET = MathLib.MAX_UINT_128;

// biome-ignore lint/complexity/useMaxParams: Mirrors Solidity MathLib helper shape.
const mulDivDown = (x: bigint, y: bigint, d: bigint) => (x * y) / d;
// biome-ignore lint/complexity/useMaxParams: Mirrors Solidity MathLib helper shape.
const mulDivUp = (x: bigint, y: bigint, d: bigint) => (x * y + d - 1n) / d;

// Midnight.take forward amounts: buy -> mulDivDown, sell -> mulDivUp.
// biome-ignore lint/complexity/useMaxParams: Mirrors Midnight.take helper shape.
const refBuyerAssets = (units: bigint, buyerPrice: bigint, buy: boolean) =>
  buy ? mulDivDown(units, buyerPrice, WAD) : mulDivUp(units, buyerPrice, WAD);
// biome-ignore lint/complexity/useMaxParams: Mirrors Midnight.take helper shape.
const refSellerAssets = (units: bigint, sellerPrice: bigint, buy: boolean) =>
  buy ? mulDivDown(units, sellerPrice, WAD) : mulDivUp(units, sellerPrice, WAD);

const tickArb = fc.oneof(
  fc.constantFrom(0n, 1n, MAX_TICK / 2n, MAX_TICK - 1n, MAX_TICK),
  fc.bigInt({ min: 0n, max: MAX_TICK }),
);
const feeArb = fc.oneof(
  fc.constantFrom(0n, 1n, MAX_FEE),
  fc.bigInt({ min: 0n, max: MAX_FEE }),
);
const targetArb = fc.oneof(
  fc.constantFrom(0n, 1n, MAX_TARGET),
  fc.bigInt({ min: 0n, max: MAX_TARGET }),
);
const offerArb = fc.record({
  buy: fc.boolean(),
  tick: tickArb,
});
const paramsArb = fc.record({
  offer: offerArb,
  settlementFee: feeArb,
  target: targetArb,
});

// Midnight src/periphery/libraries/TakeAmountsLib.sol + Midnight.sol take (price split)
describe("TakeAmountsLib.prices", () => {
  test("default", () => {
    const { buyerPrice, sellerPrice } = TakeAmountsLib.prices({
      offer: { buy: false, tick: MAX_TICK },
      settlementFee: 0n,
    });

    expect(sellerPrice).toBe(TickLib.tickToPrice(MAX_TICK));
    expect(buyerPrice).toBe(sellerPrice);
  });

  test.prop([offerArb, feeArb], { numRuns: 1000 })(
    "behavior: equals the take price split; buyer price minus seller price is the fee",
    (offer, settlementFee) => {
      const offerPrice = TickLib.tickToPrice(offer.tick);

      if (offer.buy && offerPrice < settlementFee) {
        expect(() => TakeAmountsLib.prices({ offer, settlementFee })).toThrow(
          SettlementFeeExceedsPriceError,
        );
        return;
      }

      const { buyerPrice, sellerPrice } = TakeAmountsLib.prices({
        offer,
        settlementFee,
      });

      expect(sellerPrice).toBe(
        offer.buy ? offerPrice - settlementFee : offerPrice,
      );
      expect(buyerPrice).toBe(sellerPrice + settlementFee);
      expect(buyerPrice - sellerPrice).toBe(settlementFee);
      expect(sellerPrice).toBeLessThanOrEqual(offerPrice);
    },
  );
});

// Midnight src/periphery/libraries/TakeAmountsLib.sol buyerAssetsToUnits
describe("TakeAmountsLib.buyerAssetsToUnits", () => {
  test("default", () => {
    const target = 1_000n;
    const units = TakeAmountsLib.buyerAssetsToUnits({
      offer: { buy: true, tick: MAX_TICK },
      targetBuyerAssets: target,
      settlementFee: 0n,
    });

    const { buyerPrice } = TakeAmountsLib.prices({
      offer: { buy: true, tick: MAX_TICK },
      settlementFee: 0n,
    });
    expect(refBuyerAssets(units, buyerPrice, true)).toBe(target);
  });

  test.prop([paramsArb], { numRuns: 1000 })(
    "behavior: equals the Solidity port and exactly round-trips the forward amount",
    ({ offer, settlementFee, target: targetBuyerAssets }) => {
      const offerPrice = TickLib.tickToPrice(offer.tick);
      const params = { offer, targetBuyerAssets, settlementFee };

      if (offer.buy && offerPrice < settlementFee) {
        expect(() => TakeAmountsLib.buyerAssetsToUnits(params)).toThrow(
          SettlementFeeExceedsPriceError,
        );
        return;
      }

      const sellerPrice = offer.buy ? offerPrice - settlementFee : offerPrice;
      const buyerPrice = sellerPrice + settlementFee;

      if (buyerPrice === 0n) {
        expect(() => TakeAmountsLib.buyerAssetsToUnits(params)).toThrow(
          DivisionByZeroError,
        );
        return;
      }
      if (buyerPrice > WAD) {
        expect(() => TakeAmountsLib.buyerAssetsToUnits(params)).toThrow(
          PriceGreaterThanOneError,
        );
        return;
      }

      const units = TakeAmountsLib.buyerAssetsToUnits(params);

      expect(units).toBe(
        offer.buy
          ? mulDivUp(targetBuyerAssets, WAD, buyerPrice)
          : mulDivDown(targetBuyerAssets, WAD, buyerPrice),
      );
      expect(refBuyerAssets(units, buyerPrice, offer.buy)).toBe(
        targetBuyerAssets,
      );
    },
  );
});

// Midnight src/periphery/libraries/TakeAmountsLib.sol sellerAssetsToUnits
describe("TakeAmountsLib.sellerAssetsToUnits", () => {
  test("default", () => {
    const target = 1_000n;
    const units = TakeAmountsLib.sellerAssetsToUnits({
      offer: { buy: false, tick: MAX_TICK },
      targetSellerAssets: target,
      settlementFee: 0n,
    });

    const { sellerPrice } = TakeAmountsLib.prices({
      offer: { buy: false, tick: MAX_TICK },
      settlementFee: 0n,
    });
    expect(refSellerAssets(units, sellerPrice, false)).toBe(target);
  });

  test.prop([paramsArb], { numRuns: 1000 })(
    "behavior: equals the Solidity port and exactly round-trips the forward amount",
    ({ offer, settlementFee, target: targetSellerAssets }) => {
      const offerPrice = TickLib.tickToPrice(offer.tick);
      const params = { offer, targetSellerAssets, settlementFee };

      if (offer.buy && offerPrice < settlementFee) {
        expect(() => TakeAmountsLib.sellerAssetsToUnits(params)).toThrow(
          SettlementFeeExceedsPriceError,
        );
        return;
      }

      const sellerPrice = offer.buy ? offerPrice - settlementFee : offerPrice;

      if (sellerPrice === 0n) {
        expect(() => TakeAmountsLib.sellerAssetsToUnits(params)).toThrow(
          DivisionByZeroError,
        );
        return;
      }

      const units = TakeAmountsLib.sellerAssetsToUnits(params);

      expect(units).toBe(
        offer.buy
          ? mulDivUp(targetSellerAssets, WAD, sellerPrice)
          : mulDivDown(targetSellerAssets, WAD, sellerPrice),
      );
      expect(refSellerAssets(units, sellerPrice, offer.buy)).toBe(
        targetSellerAssets,
      );
    },
  );
});

// Midnight.sol take: buyerAssets vs sellerAssets rounding favors the protocol.
describe("TakeAmountsLib take amounts", () => {
  test("default", () => {
    const units = 1_000n;
    const offer = { buy: true, tick: MAX_TICK };
    const settlementFee = 1_000n;
    const { buyerPrice, sellerPrice } = TakeAmountsLib.prices({
      offer,
      settlementFee,
    });

    expect(refBuyerAssets(units, buyerPrice, offer.buy)).toBeGreaterThanOrEqual(
      refSellerAssets(units, sellerPrice, offer.buy),
    );
  });

  test.prop([paramsArb], { numRuns: 1000 })(
    "behavior: buyer assets are never less than seller assets",
    ({ offer, settlementFee, target }) => {
      const offerPrice = TickLib.tickToPrice(offer.tick);
      fc.pre(!offer.buy || offerPrice >= settlementFee);
      fc.pre(offer.buy ? offerPrice - settlementFee > 0n : offerPrice > 0n);

      const units = TakeAmountsLib.sellerAssetsToUnits({
        offer,
        targetSellerAssets: target,
        settlementFee,
      });
      const { buyerPrice, sellerPrice } = TakeAmountsLib.prices({
        offer,
        settlementFee,
      });

      expect(refSellerAssets(units, sellerPrice, offer.buy)).toBe(target);
      expect(
        refBuyerAssets(units, buyerPrice, offer.buy),
      ).toBeGreaterThanOrEqual(target);
    },
  );

  test.prop([paramsArb], { numRuns: 1000 })(
    "behavior: units from buyer assets never pay the seller more than the buyer target",
    ({ offer, settlementFee, target }) => {
      const offerPrice = TickLib.tickToPrice(offer.tick);
      const sellerPrice = offer.buy ? offerPrice - settlementFee : offerPrice;
      const buyerPrice = sellerPrice + settlementFee;
      fc.pre(!offer.buy || offerPrice >= settlementFee);
      fc.pre(buyerPrice > 0n && buyerPrice <= WAD);

      const units = TakeAmountsLib.buyerAssetsToUnits({
        offer,
        targetBuyerAssets: target,
        settlementFee,
      });
      const prices = TakeAmountsLib.prices({ offer, settlementFee });

      expect(
        refSellerAssets(units, prices.sellerPrice, offer.buy),
      ).toBeLessThanOrEqual(target);
      expect(refBuyerAssets(units, prices.buyerPrice, offer.buy)).toBe(target);
    },
  );
});

// SDK-only generic conversion (no Solidity counterpart): TakeAmountsLib.toUnits.
describe("TakeAmountsLib.toUnits", () => {
  test("default", () => {
    expect(
      TakeAmountsLib.toUnits({
        assets: 100n,
        price: WAD,
        rounding: "Down",
      }),
    ).toBe(100n);
  });

  test.prop([targetArb, fc.bigInt({ min: 1n, max: WAD })], { numRuns: 1000 })(
    "behavior: up rounds at most one above down and never creates value",
    (assets, price) => {
      const up = TakeAmountsLib.toUnits({ assets, price, rounding: "Up" });
      const down = TakeAmountsLib.toUnits({
        assets,
        price,
        rounding: "Down",
      });

      expect(up).toBeGreaterThanOrEqual(down);
      expect(up - down).toBeLessThanOrEqual(1n);
      expect(mulDivDown(down, price, WAD)).toBeLessThanOrEqual(assets);
      expect(mulDivUp(up, price, WAD)).toBeGreaterThanOrEqual(assets);
    },
  );
});
