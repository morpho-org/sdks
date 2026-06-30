import {
  DivisionByZeroError,
  MathLib,
  NegativeValueError,
} from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { zeroAddress, zeroHash } from "viem";
import { describe, expect, test } from "vitest";
import {
  addresses,
  baseMarketInput,
  baseMarketParamsInput,
  baseOffer,
  baseOfferInput,
  group,
} from "../__test__/fixtures.js";
import { MAX_CONTINUOUS_FEE, MAX_TICK } from "../constants.js";
import {
  InvalidOfferGroupError,
  InvalidOfferParameterError,
  SettlementFeeExceedsPriceError,
} from "../errors.js";
import { Market, MarketParams } from "../market/index.js";
import { TakeAmountsLib, TickLib } from "../math/index.js";
import { TreeUtils } from "../signatures/index.js";
import type { BuildOfferParams } from "./Offer.js";
import { Offer } from "./Offer.js";
import { OfferUtils } from "./OfferUtils.js";

const buildOfferParams = (overrides: Partial<BuildOfferParams> = {}) => ({
  market: baseMarketParamsInput(),
  buy: true,
  maker: addresses.maker,
  tick: 5_000n,
  expiry: 2_100n,
  ratifier: addresses.ecrecoverRatifier,
  maxAssets: 100n,
  ...overrides,
});

const zeroFeeMarket = (
  overrides: Partial<ReturnType<typeof baseMarketInput>> = {},
) =>
  new Market({
    ...baseMarketInput(),
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: 0,
    ...overrides,
  });

describe("Offer", () => {
  test("default", () => {
    const offer = new Offer(baseOfferInput());

    expect(offer).toBeInstanceOf(Offer);
    expect(MarketParams.from(offer.market).loanToken).toBe(addresses.loanToken);
    expect(offer.price).toBe(TickLib.tickToPrice(offer.tick));
    expect(offer.getRate(1_000n)).toBe(
      OfferUtils.getRate({ offer, timestamp: 1_000n }),
    );
    expect(offer.getApr(1_000n)).toBe(
      OfferUtils.getApr({ offer, timestamp: 1_000n }),
    );
  });
});

describe("Offer.from", () => {
  test("default", () => {
    const offer = baseOffer();

    expect(Offer.from(offer)).toBe(offer);
    expect(Offer.from(baseOfferInput())).toBeInstanceOf(Offer);
  });
});

describe("Offer.create", () => {
  test("default", () => {
    const offer = Offer.create({
      market: baseMarketParamsInput(),
      buy: true,
      maker: addresses.maker,
      tick: 5_000n,
      expiry: 2_100n,
      ratifier: addresses.ecrecoverRatifier,
      maxAssets: 100n,
    });

    expect(offer.maxAssets).toBe(100n);
    expect(offer.continuousFeeCap).toBe(MAX_CONTINUOUS_FEE);
    expect(offer.receiverIfMakerIsSeller).toBe(zeroAddress);
    expect(offer.group).toBe(OfferUtils.groupHash(offer));
    expect(offer.hash).toBe(OfferUtils.hash(offer));
    expect(
      Offer.create({
        ...buildOfferParams(),
        group,
      }).group,
    ).toBe(group);
  });

  test("behavior: separates final hashes from zero-group hashes", () => {
    const offer = { ...baseOfferInput(), group };

    expect(OfferUtils.hash(offer)).toBe(
      OfferUtils.hashStruct(OfferUtils.toStruct({ offer })),
    );
    expect(OfferUtils.groupHash(offer)).toBe(
      OfferUtils.hashStruct(OfferUtils.toStruct({ offer, group: zeroHash })),
    );
    expect(OfferUtils.hash(offer)).not.toBe(OfferUtils.groupHash(offer));
  });

  test("behavior: defaults maker seller receiver for sell offers", () => {
    const offer = Offer.create(
      buildOfferParams({
        buy: false,
        maxUnits: 100n,
        maxAssets: 0n,
      }),
    );

    expect(offer.receiverIfMakerIsSeller).toBe(addresses.maker);
  });

  test("behavior: accepts ticks aligned to a refined market spacing", () => {
    const offer = Offer.create(
      buildOfferParams({
        tick: 2n,
        tickSpacing: 2n,
      }),
    );

    expect(offer.tick).toBe(2n);
  });

  test("behavior: validates deterministic parameters without constructing an offer", () => {
    const params = OfferUtils.validateOfferParams(
      buildOfferParams({
        tick: 2n,
        tickSpacing: 2n,
        start: 10n,
        expiry: 11n,
      }),
    );

    expect(params).toEqual({
      tick: 2n,
      tickSpacing: 2n,
      start: 10n,
      expiry: 11n,
      maxUnits: 0n,
      maxAssets: 100n,
      continuousFeeCap: MAX_CONTINUOUS_FEE,
      receiverIfMakerIsSeller: zeroAddress,
    });
  });

  test("behavior: exposes focused offer validation helpers", () => {
    expect(OfferUtils.validateOfferTick({ tick: 4n })).toEqual({
      tick: 4n,
      tickSpacing: 4n,
    });
    expect(OfferUtils.validateOfferTimeRange({ expiry: 1n })).toEqual({
      start: 0n,
      expiry: 1n,
    });
    expect(
      OfferUtils.validateOfferTimeRange({ start: 1n, expiry: 1n }),
    ).toEqual({
      start: 1n,
      expiry: 1n,
    });
    expect(OfferUtils.validateOfferCaps({ maxUnits: 1n })).toEqual({
      maxUnits: 1n,
      maxAssets: 0n,
    });
    expect(OfferUtils.validateContinuousFeeCap({})).toEqual({
      continuousFeeCap: MAX_CONTINUOUS_FEE,
    });
    expect(
      OfferUtils.resolveReceiverIfMakerIsSeller({
        buy: false,
        maker: addresses.maker,
      }),
    ).toBe(addresses.maker);
    expect(OfferUtils.getOfferExpiry(baseOfferInput({ expiry: 2_200n }))).toBe(
      2_200n,
    );

    const offer = baseOfferInput();
    expect(OfferUtils.getPrice(offer)).toBe(TickLib.tickToPrice(offer.tick));
    expect(OfferUtils.getRate({ offer, timestamp: 1_000n })).toBe(
      MathLib.mulDiv(TickLib.tickToRate(offer.tick), 1n, 1_000n, "Up"),
    );
    expect(OfferUtils.getApr({ offer, timestamp: 1_000n })).toBe(
      TickLib.tickToApr(offer.tick, 1_000n),
    );
  });

  test("error: invalid bigint input", () => {
    expect(() =>
      Offer.create(buildOfferParams({ tick: "not-a-tick" })),
    ).toThrow(SyntaxError);
  });

  test("error: offer rate helpers reject invalid time inputs", () => {
    const offer = baseOffer();
    const maturity = MarketParams.from(offer.market).maturity;

    expect(() => offer.getRate(-1n)).toThrow(NegativeValueError);
    expect(() => offer.getApr(-1n)).toThrow(NegativeValueError);
    expect(() => offer.getRate(maturity)).toThrow(DivisionByZeroError);
    expect(() => offer.getApr(maturity)).toThrow(DivisionByZeroError);
  });

  test.each([
    ["tick", { tick: -1n }],
    ["tick", { tick: MAX_TICK + 1n }],
    ["tickSpacing", { tickSpacing: 3n }],
    ["tick", { tick: 2n }],
    ["expiry", { start: 20n, expiry: 19n }],
    ["maxUnits", { maxUnits: -1n, maxAssets: 0n }],
    ["maxAssets", { maxAssets: -1n }],
    ["continuousFeeCap", { continuousFeeCap: -1n }],
    ["maxUnits/maxAssets", { maxUnits: 0n, maxAssets: 0n }],
    ["maxUnits/maxAssets", { maxUnits: 1n, maxAssets: 1n }],
    [
      "receiverIfMakerIsSeller",
      { receiverIfMakerIsSeller: addresses.receiver },
    ],
  ] as const)("error: InvalidOfferParameterError %s", (parameter, overrides) => {
    try {
      Offer.create(buildOfferParams(overrides));
    } catch (error) {
      if (!(error instanceof InvalidOfferParameterError)) throw error;

      expect(error.parameter).toBe(parameter);
      return;
    }

    expect.unreachable("Expected invalid offer parameter.");
  });
});

describe("OfferUtils.toStruct", () => {
  test("behavior: copies nested market structs before public freeze paths", () => {
    const offer = baseOffer({ group });
    const offerMarket = MarketParams.from(offer.market);
    const struct = OfferUtils.toStruct({ offer });

    expect(struct.market).not.toBe(offer.market);
    expect(struct.market).not.toBeInstanceOf(MarketParams);
    expect(struct.market.collateralParams).not.toBe(
      offerMarket.collateralParams,
    );
    expect(struct.market.collateralParams[0]).not.toBe(
      offerMarket.collateralParams[0],
    );

    TreeUtils.buildDescriptor([offer]);

    expect(Object.isFrozen(offer.market)).toBe(false);
    expect(Object.isFrozen(offerMarket.collateralParams)).toBe(false);
    expect(Object.isFrozen(offerMarket.collateralParams[0])).toBe(false);
  });
});

describe("OfferUtils.getConsumableUnits", () => {
  test("default: max-unit offers use zero-floor subtraction", () => {
    const offer = baseOffer({
      market: zeroFeeMarket(),
      maxUnits: 100n,
      maxAssets: 0n,
    });

    expect(
      OfferUtils.getConsumableUnits({
        offer,
        consumed: 40n,
        timestamp: 1_000n,
      }),
    ).toBe(60n);
    expect(
      offer.getConsumableUnits({ consumed: 120n, timestamp: 1_000n }),
    ).toBe(0n);
  });

  test("behavior: offers below market continuous fee return zero", () => {
    const offer = baseOffer({
      market: zeroFeeMarket({ continuousFee: 10 }),
      maxUnits: 100n,
      maxAssets: 0n,
      continuousFeeCap: 9n,
    });

    expect(
      OfferUtils.getConsumableUnits({
        offer,
        consumed: 40n,
        timestamp: 1_000n,
      }),
    ).toBe(0n);
  });

  test("behavior: buy max assets return max units accepted by buyer asset cap", () => {
    const offer = baseOffer({
      market: zeroFeeMarket(),
      buy: true,
      tick: MAX_TICK / 2n,
      maxUnits: 0n,
      maxAssets: 1n,
    });

    expect(
      OfferUtils.getConsumableUnits({
        offer,
        consumed: 0n,
        timestamp: 1_000n,
      }),
    ).toBe(3n);
    expect(
      TakeAmountsLib.buyerAssetsToUnits({
        offer,
        targetBuyerAssets: 1n,
        settlementFee: 0n,
      }),
    ).toBe(2n);
  });

  test("behavior: sell max assets convert seller assets", () => {
    const offer = baseOffer({
      market: zeroFeeMarket(),
      buy: false,
      maxUnits: 0n,
      maxAssets: 123n,
    });

    expect(
      OfferUtils.getConsumableUnits({
        offer,
        consumed: 23n,
        timestamp: 1_000n,
      }),
    ).toBe(
      TakeAmountsLib.sellerAssetsToUnits({
        offer,
        targetSellerAssets: 100n,
        settlementFee: 0n,
      }),
    );
  });

  test("behavior: buy max assets match onchain floor cap rounding", () => {
    fc.assert(
      fc.property(
        fc.record({
          maxAssets: fc.bigInt({ min: 1n, max: 1_000_000n }),
          consumed: fc.bigInt({ min: 0n, max: 1_000_000n }),
          tick: fc.bigInt({ min: 0n, max: MAX_TICK }),
        }),
        ({ maxAssets, consumed, tick }) => {
          const offer = baseOffer({
            market: zeroFeeMarket(),
            buy: true,
            tick,
            maxUnits: 0n,
            maxAssets,
          });
          const { buyerPrice } = TakeAmountsLib.prices({
            offer,
            settlementFee: 0n,
          });
          fc.pre(buyerPrice > 0n);

          const remainingAssets = MathLib.zeroFloorSub(maxAssets, consumed);
          const units = OfferUtils.getConsumableUnits({
            offer,
            consumed,
            timestamp: 1_000n,
          });

          expect(
            MathLib.mulDivDown(units, buyerPrice, MathLib.WAD) <=
              remainingAssets,
          ).toBe(true);
          expect(
            MathLib.mulDivDown(units + 1n, buyerPrice, MathLib.WAD) >
              remainingAssets,
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("behavior: sell max assets match onchain ceil cap rounding", () => {
    fc.assert(
      fc.property(
        fc.record({
          maxAssets: fc.bigInt({ min: 1n, max: 1_000_000n }),
          consumed: fc.bigInt({ min: 0n, max: 1_000_000n }),
          tick: fc.bigInt({ min: 0n, max: MAX_TICK }),
        }),
        ({ maxAssets, consumed, tick }) => {
          const offer = baseOffer({
            market: zeroFeeMarket(),
            buy: false,
            tick,
            maxUnits: 0n,
            maxAssets,
          });
          const { sellerPrice } = TakeAmountsLib.prices({
            offer,
            settlementFee: 0n,
          });
          fc.pre(sellerPrice > 0n);

          const remainingAssets = MathLib.zeroFloorSub(maxAssets, consumed);
          const units = OfferUtils.getConsumableUnits({
            offer,
            consumed,
            timestamp: 1_000n,
          });

          expect(
            MathLib.mulDivUp(units, sellerPrice, MathLib.WAD) <=
              remainingAssets,
          ).toBe(true);
          expect(
            MathLib.mulDivUp(units + 1n, sellerPrice, MathLib.WAD) >
              remainingAssets,
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("behavior: zero asset price leaves asset cap unbounded", () => {
    expect(
      OfferUtils.getConsumableUnits({
        offer: baseOffer({
          market: zeroFeeMarket(),
          buy: true,
          tick: 0n,
          maxUnits: 0n,
        }),
        consumed: 0n,
        timestamp: 1_000n,
      }),
    ).toBe(MathLib.MAX_UINT_256);
    expect(
      OfferUtils.getConsumableUnits({
        offer: baseOffer({
          market: zeroFeeMarket(),
          buy: false,
          tick: 0n,
          maxUnits: 0n,
        }),
        consumed: 0n,
        timestamp: 1_000n,
      }),
    ).toBe(MathLib.MAX_UINT_256);
  });

  test("error: InvalidOfferParameterError without hydrated market state", () => {
    expect(() =>
      OfferUtils.getConsumableUnits({
        offer: baseOffer({
          market: baseMarketParamsInput(),
          maxUnits: 100n,
          maxAssets: 0n,
        }),
        consumed: 0n,
        timestamp: 1_000n,
      }),
    ).toThrow(InvalidOfferParameterError);
  });

  test("error: NegativeValueError", () => {
    expect(() =>
      OfferUtils.getConsumableUnits({
        offer: baseOffer({
          market: zeroFeeMarket(),
          maxUnits: 100n,
          maxAssets: 0n,
        }),
        consumed: -1n,
        timestamp: 1_000n,
      }),
    ).toThrow(NegativeValueError);
    expect(() =>
      OfferUtils.getConsumableUnits({
        offer: baseOffer({
          market: zeroFeeMarket(),
          maxUnits: -1n,
          maxAssets: 0n,
        }),
        consumed: 0n,
        timestamp: 1_000n,
      }),
    ).toThrow(NegativeValueError);
  });

  test("error: InvalidOfferParameterError for cap shape", () => {
    expect(() =>
      OfferUtils.getConsumableUnits({
        offer: baseOffer({
          market: zeroFeeMarket(),
          maxUnits: 0n,
          maxAssets: 0n,
        }),
        consumed: 0n,
        timestamp: 1_000n,
      }),
    ).toThrow(InvalidOfferParameterError);
    expect(() =>
      OfferUtils.getConsumableUnits({
        offer: baseOffer({
          market: zeroFeeMarket(),
          maxUnits: 1n,
          maxAssets: 1n,
        }),
        consumed: 0n,
        timestamp: 1_000n,
      }),
    ).toThrow(InvalidOfferParameterError);
  });

  test("error: SettlementFeeExceedsPriceError", () => {
    expect(() =>
      OfferUtils.getConsumableUnits({
        offer: baseOffer({
          market: zeroFeeMarket({
            settlementFeeCbps: [1, 1, 1, 1, 1, 1, 1],
          }),
          buy: true,
          tick: 0n,
          maxUnits: 0n,
        }),
        consumed: 0n,
        timestamp: 1_000n,
      }),
    ).toThrow(SettlementFeeExceedsPriceError);
  });
});

describe("OfferUtils.validateOfferGroup", () => {
  test("default", () => {
    const offers = [
      Offer.create(buildOfferParams({ tick: 5_000n })),
      Offer.create(buildOfferParams({ tick: 5_004n })),
    ];

    expect(OfferUtils.validateOfferGroup({ offers })).toEqual(offers);
  });

  test("behavior: allows fields outside protocol grouping mechanics to differ", () => {
    const offers = OfferUtils.validateOfferGroup({
      offers: [
        Offer.create(
          buildOfferParams({
            start: 10n,
            expiry: 2_200n,
            ratifier: addresses.ecrecoverRatifier,
          }),
        ),
        Offer.create(
          buildOfferParams({
            start: 20n,
            expiry: 2_300n,
            callback: addresses.callback,
            callbackData: "0x1234",
            ratifier: addresses.setterRatifier,
          }),
        ),
      ],
    });

    expect(offers[0]!.ratifier).toBe(addresses.ecrecoverRatifier);
    expect(offers[1]!.ratifier).toBe(addresses.setterRatifier);
    expect(offers[1]!.callback).toBe(addresses.callback);
  });

  test("behavior: accepts arbitrary protocol-valid groups", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            tickStep: fc.integer({ min: 0, max: Number(MAX_TICK / 4n) }),
            start: fc.integer({ min: 0, max: 1_000 }),
            duration: fc.integer({ min: 1, max: 1_000 }),
            useCallback: fc.boolean(),
            useSetterRatifier: fc.boolean(),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        (entries) => {
          const offers = entries.map((entry) =>
            Offer.create(
              buildOfferParams({
                tick: BigInt(entry.tickStep) * 4n,
                start: BigInt(entry.start),
                expiry: BigInt(entry.start + entry.duration),
                callback: entry.useCallback ? addresses.callback : undefined,
                callbackData: entry.useCallback ? "0x1234" : undefined,
                ratifier: entry.useSetterRatifier
                  ? addresses.setterRatifier
                  : addresses.ecrecoverRatifier,
              }),
            ),
          );

          expect(OfferUtils.validateOfferGroup({ offers })).toEqual(offers);
        },
      ),
      { numRuns: 100 },
    );
  });

  test.each([
    [
      "maker",
      [
        Offer.create(buildOfferParams()),
        Offer.create(buildOfferParams({ maker: addresses.taker })),
      ],
    ],
    [
      "side",
      [
        Offer.create(buildOfferParams()),
        Offer.create(
          buildOfferParams({ buy: false, receiverIfMakerIsSeller: undefined }),
        ),
      ],
    ],
    [
      "loan token",
      [
        Offer.create(buildOfferParams()),
        Offer.create(
          buildOfferParams({
            market: {
              ...baseMarketParamsInput(),
              loanToken: "0x0000000000000000000000000000000000006100",
            },
          }),
        ),
      ],
    ],
    [
      "cap mode",
      [
        Offer.create(buildOfferParams({ maxAssets: 100n, maxUnits: 0n })),
        Offer.create(buildOfferParams({ maxAssets: 0n, maxUnits: 100n })),
      ],
    ],
    [
      "cap value",
      [
        Offer.create(buildOfferParams({ maxAssets: 100n })),
        Offer.create(buildOfferParams({ maxAssets: 101n })),
      ],
    ],
  ] as const)("error: InvalidOfferGroupError mixed %s", (_field, offers) => {
    expect(() => OfferUtils.validateOfferGroup({ offers })).toThrow(
      InvalidOfferGroupError,
    );
  });

  test("error: InvalidOfferGroupError for invalid caps", () => {
    expect(() =>
      OfferUtils.validateOfferGroup({
        offers: [baseOffer({ maxUnits: 0n, maxAssets: 0n })],
      }),
    ).toThrow(InvalidOfferGroupError);
  });
});
