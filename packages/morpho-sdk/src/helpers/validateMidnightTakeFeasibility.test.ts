import { MathLib } from "@morpho-org/blue-sdk";
import {
  MAX_TICK,
  Market,
  MarketUtils,
  TickLib,
} from "@morpho-org/midnight-sdk";
import { maxUint256, parseEther, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightMarket,
} from "../../test/fixtures/midnight.js";
import {
  ExpiredDeadlineError,
  MidnightContinuousFeeAboveMaxError,
  MidnightRepayExceedsDebtError,
  MidnightTakeableOffersNotFillableError,
  MidnightTakeTargetUnreachableError,
} from "../types/index.js";
import {
  type MidnightTakeFeasibilityParams,
  validateMidnightSellTargetBounds,
  validateMidnightTakeFeasibility,
} from "./validateMidnightTakeFeasibility.js";

const marketData = (
  overrides: Partial<{
    continuousFee: number;
    settlementFeeCbps: Market["settlementFeeCbps"];
  }> = {},
) =>
  new Market({
    params: midnightMarket,
    totalUnits: 0n,
    lossFactor: 0n,
    withdrawable: 0n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: overrides.settlementFeeCbps ?? [0, 0, 0, 0, 0, 0, 0],
    continuousFee: overrides.continuousFee ?? 0,
    tickSpacing: 1,
  });

const take = (
  overrides: Parameters<typeof midnightApiTake>[0] = {},
  units = 1_000n,
) => ({ ...midnightApiTake({ tick: 4_000n, ...overrides }), units });

// Fixture market matures at 2_000 and offers expire at 2_100.
const now = 1_000n;
const deadline = now + 600n;

const buy = (
  overrides: Partial<Extract<MidnightTakeFeasibilityParams, { side: "buy" }>>,
) =>
  validateMidnightTakeFeasibility({
    side: "buy",
    takeableOffers: [take()],
    accountAddress: midnightAddresses.taker,
    marketData: marketData(),
    now,
    deadline,
    referralFeePct: 0n,
    fallbackUnits: 0n,
    target: { type: "units", units: 1_000n, maxBuyerAssets: 1_000n },
    maxContinuousFee: maxUint256,
    ...overrides,
  });

const sell = (
  overrides: Partial<Extract<MidnightTakeFeasibilityParams, { side: "sell" }>>,
) =>
  validateMidnightTakeFeasibility({
    side: "sell",
    takeableOffers: [take({ buy: true })],
    accountAddress: midnightAddresses.taker,
    marketData: marketData(),
    now,
    deadline,
    referralFeePct: 0n,
    fallbackUnits: 0n,
    target: { type: "units", units: 1_000n, minSellerAssets: 1n },
    increasesDebt: true,
    ...overrides,
  });

describe("validateMidnightSellTargetBounds", () => {
  test("default", () => {
    expect(() =>
      validateMidnightSellTargetBounds({
        target: { type: "units", units: 1_000n, minSellerAssets: 990n },
        referralFeePct: parseEther("0.01"),
      }),
    ).not.toThrow();
    expect(() =>
      validateMidnightSellTargetBounds({
        target: { type: "assets", assets: 1_000n, maxUnits: 1_000n },
        referralFeePct: 0n,
      }),
    ).not.toThrow();
  });

  test.each([
    {
      name: "minSellerAssets above units",
      target: { type: "units", units: 1_000_000n, minSellerAssets: 1_000_001n },
      referralFeePct: 0n,
      expected: {
        field: "target.minSellerAssets",
        value: 1_000_001n,
        limit: 1_000_000n,
      },
    },
    {
      name: "minSellerAssets above units net of the fee",
      target: { type: "units", units: 1_000n, minSellerAssets: 991n },
      referralFeePct: parseEther("0.01"),
      expected: { field: "target.minSellerAssets", value: 991n, limit: 990n },
    },
    {
      name: "maxUnits below assets",
      target: { type: "assets", assets: 100_000n, maxUnits: 99_999n },
      referralFeePct: 0n,
      expected: { field: "target.maxUnits", value: 99_999n, limit: 100_000n },
    },
    {
      name: "maxUnits below assets plus the fee",
      target: { type: "assets", assets: 1_000_000n, maxUnits: 1_000_000n },
      referralFeePct: parseEther("0.01"),
      expected: {
        field: "target.maxUnits",
        value: 1_000_000n,
        limit: 1_010_101n,
      },
    },
  ] as const)("error: $name", ({ target, referralFeePct, expected }) => {
    const build = () =>
      validateMidnightSellTargetBounds({ target, referralFeePct });

    expect(build).toThrow(MidnightTakeTargetUnreachableError);
    expect(build).toThrow(expect.objectContaining(expected));
  });
});

describe("validateMidnightTakeFeasibility", () => {
  test("default", () => {
    const takeableOffers = [take()];

    expect(buy({ takeableOffers })).toBe(takeableOffers);
  });

  test.each([
    { reason: "zeroUnits", offer: take({}, 0n) },
    { reason: "expired", offer: take({ expiry: now - 1n }) },
    { reason: "notStarted", offer: take({ start: deadline + 1n }) },
    {
      reason: "selfTake",
      offer: take({
        maker: midnightAddresses.taker,
        receiverIfMakerIsSeller: midnightAddresses.taker,
      }),
    },
  ] as const)("error: $reason offer cannot fill", ({ reason, offer }) => {
    const build = () => buy({ takeableOffers: [offer] });

    expect(build).toThrow(MidnightTakeableOffersNotFillableError);
    expect(build).toThrow(
      expect.objectContaining({ offers: [{ index: 0, reason }] }),
    );
  });

  test("error: ExpiredDeadlineError when the clock passed the deadline", () => {
    expect(() => buy({ deadline: now - 1n })).toThrow(ExpiredDeadlineError);
  });

  test("behavior: a sell does not price an out-of-range tick", () => {
    expect(() =>
      sell({
        takeableOffers: [
          take({ buy: true, tick: 2n ** 64n }),
          take({ buy: true }),
        ],
      }),
    ).not.toThrow();
  });

  test("behavior: an out-of-range tick is dead, and removed from a buy assets target", () => {
    const outOfRange = take({ tick: MAX_TICK + 1n });
    expect(buy({ takeableOffers: [outOfRange, take()] })).toHaveLength(2);
    expect(
      buy({
        takeableOffers: [outOfRange, take()],
        target: { type: "assets", assets: 500n, minUnits: 1n },
      }),
    ).toHaveLength(1);
    expect(() => buy({ takeableOffers: [outOfRange] })).toThrow(
      expect.objectContaining({
        name: "MidnightTakeableOffersNotFillableError",
        offers: [{ index: 0, reason: "tickOutOfRange" }],
      }),
    );
  });

  test("behavior: an empty offer list is left to the raw builder", () => {
    expect(buy({ takeableOffers: [], fallbackUnits: 1_000n })).toEqual([]);
    expect(sell({ takeableOffers: [], fallbackUnits: 1_000n })).toEqual([]);
    expect(sell({ takeableOffers: [] })).toEqual([]);
  });

  test("behavior: a sell drops buy offers whose price conversion reverts", () => {
    const live = take({ buy: true });
    const zeroPrice = take({ buy: true, tick: 0n });
    const outOfRange = take({ buy: true, tick: MAX_TICK + 1n });

    expect(sell({ takeableOffers: [zeroPrice, outOfRange, live] })).toEqual([
      live,
    ]);
    expect(() =>
      sell({
        takeableOffers: [zeroPrice],
        target: { type: "assets", assets: 500n, maxUnits: 1_000n },
        fallbackUnits: 1_000n,
      }),
    ).toThrow(
      expect.objectContaining({
        offers: [{ index: 0, reason: "zeroBuyerPrice" }],
      }),
    );
  });

  test("error: every buy offer is priced below the settlement fee", () => {
    const settlementFeeCbps = [
      50_000, 50_000, 50_000, 50_000, 50_000, 50_000, 50_000,
    ] as const;
    const cheap = take({ buy: true, tick: 1_000n });
    const fee = MarketUtils.getSettlementFee({
      settlementFeeCbps,
      timeToMaturity: midnightMarket.maturity - deadline,
    });
    expect(TickLib.tickToPrice(cheap.offer.tick)).toBeLessThan(fee);

    expect(() =>
      sell({
        marketData: marketData({ settlementFeeCbps }),
        takeableOffers: [cheap, cheap],
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightTakeableOffersNotFillableError",
        offers: [
          { index: 0, reason: "priceBelowSettlementFee" },
          { index: 1, reason: "priceBelowSettlementFee" },
        ],
      }),
    );
    expect(
      sell({
        marketData: marketData({ settlementFeeCbps }),
        takeableOffers: [cheap, take({ buy: true, tick: 6_000n })],
      }),
    ).toHaveLength(1);
  });

  test("behavior: a sell assets target drops a buy offer priced exactly at the settlement fee", () => {
    const settlementFeeCbps = [1, 1, 1, 1, 1, 1, 1] as const;
    const atFee = take({ buy: true, tick: 592n });
    const live = take({ buy: true });
    expect(TickLib.tickToPrice(atFee.offer.tick)).toBe(
      MarketUtils.getSettlementFee({ settlementFeeCbps, timeToMaturity: 0n }),
    );

    expect(
      sell({
        marketData: marketData({ settlementFeeCbps }),
        takeableOffers: [atFee, live],
        target: { type: "assets", assets: 500n, maxUnits: 1_000n },
      }),
    ).toEqual([live]);
    expect(
      sell({
        marketData: marketData({ settlementFeeCbps }),
        takeableOffers: [atFee, live],
      }),
    ).toEqual([atFee, live]);
  });

  test("behavior: a sell keeps a buy offer priced above the window's lowest settlement fee", () => {
    // The fee rises from 0 at maturity, so it is lowest at the deadline (400s before maturity).
    const settlementFeeCbps = [0, 150, 150, 150, 150, 150, 150] as const;
    const fee = (ttm: bigint) =>
      MarketUtils.getSettlementFee({ settlementFeeCbps, timeToMaturity: ttm });
    const minFee = fee(midnightMarket.maturity - deadline);
    const maxFee = fee(midnightMarket.maturity - now);
    const between = take({ buy: true, tick: 592n });
    const below = take({ buy: true, tick: 500n });
    const live = take({ buy: true });
    expect(TickLib.tickToPrice(between.offer.tick)).toBeGreaterThan(minFee);
    expect(TickLib.tickToPrice(between.offer.tick)).toBeLessThan(maxFee);
    expect(TickLib.tickToPrice(below.offer.tick)).toBeLessThan(minFee);

    expect(
      sell({
        marketData: marketData({ settlementFeeCbps }),
        takeableOffers: [between, below, live],
      }),
    ).toEqual([between, live]);
    expect(() =>
      sell({
        marketData: marketData({ settlementFeeCbps }),
        takeableOffers: [below],
        fallbackUnits: 1_000n,
      }),
    ).toThrow(
      expect.objectContaining({
        offers: [{ index: 0, reason: "priceBelowSettlementFee" }],
      }),
    );
  });

  test("behavior: a fallback fills when only some dead offers are removed", () => {
    const expiredSell = take({ buy: true, expiry: now - 1n });
    expect(
      sell({
        takeableOffers: [take({ buy: true, tick: 0n }), expiredSell],
        fallbackUnits: 1_000n,
      }),
    ).toEqual([expiredSell]);

    const expiredBuy = take({ expiry: now - 1n });
    expect(
      buy({
        takeableOffers: [take({ tick: 0n }), expiredBuy],
        fallbackUnits: 1_000n,
        target: { type: "assets", assets: 900n, minUnits: 1n },
      }),
    ).toEqual([expiredBuy]);
  });

  test("error: offer continuous fee cap below the market fee", () => {
    const build = () =>
      buy({
        marketData: marketData({ continuousFee: 10 }),
        takeableOffers: [take({ continuousFeeCap: 9n })],
      });

    expect(build).toThrow(
      expect.objectContaining({
        name: "MidnightTakeableOffersNotFillableError",
        offers: [{ index: 0, reason: "continuousFeeCapBelowMarketFee" }],
        message:
          'No Midnight takeable offer can fill: offer "0" is "continuousFeeCapBelowMarketFee". Refresh the quote and try again.',
      }),
    );
  });

  test("behavior: dead offers are kept when another offer is live", () => {
    const takeableOffers = [take({ expiry: now - 1n }), take()];

    expect(buy({ takeableOffers })).toBe(takeableOffers);
  });

  test("behavior: a dead-offer list builds when the fallback can fill", () => {
    const takeableOffers = [take({ expiry: now - 1n })];

    expect(
      buy({
        takeableOffers,
        fallbackUnits: 1_000n,
        debt: 1_000n,
        target: { type: "units", units: 1_000n, maxBuyerAssets: 1_000n },
      }),
    ).toBe(takeableOffers);
  });

  test("error: buy offer with a non-zero receiverIfMakerIsSeller", () => {
    expect(() =>
      sell({
        takeableOffers: [
          take({ buy: true, receiverIfMakerIsSeller: midnightAddresses.maker }),
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        offers: [{ index: 0, reason: "receiverIfMakerIsSellerNotZero" }],
      }),
    );
  });

  test("error: matured market blocks debt-increasing sells", () => {
    const build = () => sell({ now: 2_001n, deadline: 2_601n });

    expect(build).toThrow(
      expect.objectContaining({
        offers: [{ index: 0, reason: "marketMatured" }],
      }),
    );
    expect(() =>
      sell({ now: 2_001n, deadline: 2_601n, increasesDebt: false }),
    ).not.toThrow();
  });

  test("behavior: after maturity, debt-increasing sells only sell the credit left after the withdrawal", () => {
    const matured = { now: 2_001n, deadline: 2_601n };

    expect(() => sell({ ...matured, credit: 1_000n })).not.toThrow();
    expect(() => sell({ ...matured, credit: 999n })).toThrow(
      expect.objectContaining({
        field: "takeableOffers",
        value: 999n,
        limit: 1_000n,
      }),
    );
    expect(() =>
      sell({ ...matured, credit: 1_000n, fallbackUnits: 600n }),
    ).not.toThrow();
    expect(() =>
      sell({ ...matured, credit: 600n, fallbackUnits: 600n }),
    ).toThrow(
      expect.objectContaining({ field: "takeableOffers", value: 600n }),
    );
  });

  test("behavior: removes zero-price offers from a buy assets target", () => {
    const live = take();
    const result = buy({
      takeableOffers: [take({ tick: 0n }), live],
      target: { type: "assets", assets: 900n, minUnits: 1n },
    });

    expect(result).toEqual([live]);
  });

  test.each([
    { name: "zero-price", tick: 0n, settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0] },
    {
      name: "above-par",
      tick: 6_744n,
      settlementFeeCbps: [1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000],
    },
  ] as const)(
    "behavior: removes expired $name offers from a buy assets target",
    ({ tick, settlementFeeCbps }) => {
      const live = take();
      const result = buy({
        takeableOffers: [take({ tick, expiry: 0n }), live],
        marketData: marketData({ settlementFeeCbps: [...settlementFeeCbps] }),
        target: { type: "assets", assets: 900n, minUnits: 1n },
      });

      expect(result).toEqual([live]);
    },
  );

  test("behavior: keeps zero-price offers when a settlement fee prices them", () => {
    const takeableOffers = [take({ tick: 0n })];

    expect(
      buy({
        takeableOffers,
        marketData: marketData({ settlementFeeCbps: [1, 1, 1, 1, 1, 1, 1] }),
        target: { type: "assets", assets: 900n, minUnits: 1n },
      }),
    ).toBe(takeableOffers);
  });

  test("error: every offer of a buy assets target aborts the bundle", () => {
    const build = () =>
      buy({
        takeableOffers: [take({ tick: 0n })],
        fallbackUnits: 1_000n,
        debt: 1_000n,
        target: { type: "assets", assets: 900n, minUnits: 1n },
      });

    expect(build).toThrow(
      expect.objectContaining({
        offers: [{ index: 0, reason: "zeroBuyerPrice" }],
      }),
    );
  });

  test("behavior: removes above-par offers under a settlement fee", () => {
    const live = take();
    const result = buy({
      takeableOffers: [take({ tick: 6_744n }), live],
      marketData: marketData({
        settlementFeeCbps: [1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000],
      }),
      target: { type: "assets", assets: 900n, minUnits: 1n },
    });

    expect(result).toEqual([live]);
  });

  test("error: live offers cannot hold the units target", () => {
    const build = () =>
      sell({
        target: { type: "units", units: 1_500n, minSellerAssets: 1n },
        fallbackUnits: 400n,
      });

    expect(build).toThrow(
      expect.objectContaining({
        name: "MidnightTakeTargetUnreachableError",
        field: "takeableOffers",
        value: 1_400n,
        limit: 1_500n,
      }),
    );
  });

  test("error: live offers cannot hold a buy assets target's minUnits", () => {
    const build = () =>
      buy({
        takeableOffers: [take({}, 500n)],
        target: { type: "assets", assets: 400n, minUnits: 900n },
      });

    expect(build).toThrow(MidnightTakeTargetUnreachableError);
    expect(build).toThrow(
      expect.objectContaining({
        field: "takeableOffers",
        value: 500n,
        limit: 900n,
      }),
    );
  });

  test("behavior: buy assets target minUnits at offer capacity passes", () => {
    const takeableOffers = [take({}, 500n)];

    expect(
      buy({
        takeableOffers,
        target: { type: "assets", assets: 400n, minUnits: 500n },
      }),
    ).toBe(takeableOffers);
  });

  test("error: maxBuyerAssets below the cheapest cost plus the referral fee", () => {
    const build = () =>
      buy({
        referralFeePct: parseEther("0.1"),
        target: { type: "units", units: 1_000n, maxBuyerAssets: 958n },
      });

    expect(build).toThrow(
      expect.objectContaining({
        field: "target.maxBuyerAssets",
        value: 958n,
        limit:
          958n + MathLib.mulDivDown(958n, parseEther("0.1"), parseEther("0.9")),
      }),
    );
    expect(() =>
      buy({ target: { type: "units", units: 1_000n, maxBuyerAssets: 958n } }),
    ).not.toThrow();
  });

  test("error: maxContinuousFee below the market fee", () => {
    const build = () =>
      buy({
        marketData: marketData({ continuousFee: 10 }),
        maxContinuousFee: 9n,
      });

    expect(build).toThrow(MidnightContinuousFeeAboveMaxError);
    expect(build).toThrow(
      expect.objectContaining({
        maxContinuousFee: 9n,
        continuousFee: 10n,
        message:
          'Midnight market continuous fee "10" exceeds maxContinuousFee "9". Raise maxContinuousFee or refresh the market data.',
      }),
    );
  });

  test.each([
    {
      target: { type: "units", units: 1_001n, maxBuyerAssets: 2_000n },
      expected: { field: "target.units", value: 1_001n },
    },
    {
      target: { type: "assets", assets: 900n, minUnits: 1_001n },
      expected: { field: "target.minUnits", value: 1_001n },
    },
    {
      target: { type: "assets", assets: 1_001n, minUnits: 1n },
      expected: { field: "target.assets", value: 1_001n },
    },
  ] as const)(
    "error: repay $expected.field above the debt",
    ({ target, expected }) => {
      const build = () => buy({ target, debt: 1_000n, fallbackUnits: 1_000n });

      expect(build).toThrow(MidnightRepayExceedsDebtError);
      expect(build).toThrow(
        expect.objectContaining({ ...expected, debt: 1_000n }),
      );
    },
  );

  test("behavior: an assets repay compares the debt net of the referral fee", () => {
    const repay = (assets: bigint) => () =>
      buy({
        target: { type: "assets", assets, minUnits: 1n },
        referralFeePct: parseEther("0.01"),
        debt: 1_000n,
        fallbackUnits: 1_000n,
      });

    expect(repay(1_010n)).not.toThrow();
    expect(repay(1_012n)).toThrow(MidnightRepayExceedsDebtError);
    expect(repay(1_012n)).toThrow(
      expect.objectContaining({ field: "target.assets", value: 1_002n }),
    );
  });

  test("behavior: a settlement-fee breakpoint inside the window keeps a zero-price offer", () => {
    // The fee is zero at both window ends (1d and 30d) and positive at the 7d breakpoint.
    const maturity = 3_000_000n;
    const market = new Market({
      params: { ...midnightMarket, maturity },
      totalUnits: 0n,
      lossFactor: 0n,
      withdrawable: 0n,
      continuousFeeCredit: 0n,
      settlementFeeCbps: [0, 0, 1_000, 0, 0, 0, 0],
      continuousFee: 0,
      tickSpacing: 1,
    });
    const zeroPrice = take({ tick: 0n, expiry: maturity });
    const live = take({ expiry: maturity });

    expect(
      buy({
        takeableOffers: [zeroPrice, live],
        marketData: market,
        now: maturity - 30n * 86_400n,
        deadline: maturity - 86_400n,
        target: { type: "assets", assets: 900n, minUnits: 1n },
      }),
    ).toEqual([zeroPrice, live]);
  });

  test("behavior: a full repay target resolves to the debt", () => {
    expect(() =>
      buy({
        target: { type: "units", units: maxUint256, maxBuyerAssets: 958n },
        debt: 1_000n,
      }),
    ).not.toThrow();
    expect(() =>
      buy({
        target: { type: "units", units: maxUint256, maxBuyerAssets: 957n },
        debt: 1_000n,
      }),
    ).toThrow(expect.objectContaining({ field: "target.maxBuyerAssets" }));
  });

  test("behavior: accepts buy offers with a zero receiverIfMakerIsSeller", () => {
    expect(() =>
      sell({
        takeableOffers: [
          take({ buy: true, receiverIfMakerIsSeller: zeroAddress }),
        ],
      }),
    ).not.toThrow();
  });
});
