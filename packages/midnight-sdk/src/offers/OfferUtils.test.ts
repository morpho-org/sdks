import fc from "fast-check";
import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  addresses,
  baseMarketParamsInput,
  baseOffer,
  baseOfferInput,
  group,
} from "../__test__/fixtures.js";
import { MAX_TICK } from "../constants.js";
import {
  InconsistentMarketError,
  InvalidOfferGroupError,
  InvalidOfferParameterError,
  NoMatchingOffersError,
  UnexpectedOfferSideError,
} from "../errors.js";
import type { BuildOfferParams } from "./Offer.js";
import { Offer } from "./Offer.js";
import { OfferUtils } from "./OfferUtils.js";
import { TakeableOffer } from "./TakeableOffer.js";
import { TakeableOfferUtils } from "./TakeableOfferUtils.js";

const buildOfferParams = (overrides: Partial<BuildOfferParams> = {}) => ({
  market: baseMarketParamsInput(),
  buy: true,
  maker: addresses.maker,
  tick: 5_000n,
  expiry: 2_100n,
  group,
  ratifier: addresses.ecrecoverRatifier,
  maxAssets: 100n,
  ...overrides,
});

const offerGroupEntry = (
  overrides: Partial<Omit<BuildOfferParams, "group">> = {},
): Omit<BuildOfferParams, "group"> => ({
  market: baseMarketParamsInput(),
  buy: true,
  maker: addresses.maker,
  tick: 5_000n,
  expiry: 2_100n,
  ratifier: addresses.ecrecoverRatifier,
  maxAssets: 100n,
  ...overrides,
});

const otherGroup =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as const;

describe("Offer", () => {
  test("default", () => {
    const offer = new Offer(baseOfferInput());

    expect(offer).toBeInstanceOf(Offer);
    expect(offer.market.loanToken).toBe(addresses.loanToken);
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
      group,
      ratifier: addresses.ecrecoverRatifier,
      maxAssets: 100n,
    });

    expect(offer.group).toBe(group);
    expect(offer.maxAssets).toBe(100n);
    expect(offer.receiverIfMakerIsSeller).toBe(zeroAddress);
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
        expiry: 10n,
      }),
    );

    expect(params).toEqual({
      tick: 2n,
      tickSpacing: 2n,
      start: 10n,
      expiry: 10n,
      maxUnits: 0n,
      maxAssets: 100n,
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
    expect(OfferUtils.validateOfferCaps({ maxUnits: 1n })).toEqual({
      maxUnits: 1n,
      maxAssets: 0n,
    });
    expect(
      OfferUtils.resolveReceiverIfMakerIsSeller({
        buy: false,
        maker: addresses.maker,
      }),
    ).toBe(addresses.maker);
  });

  test("error: InvalidOfferParameterError fields", () => {
    try {
      Offer.create(buildOfferParams({ tick: "not-a-tick" }));
    } catch (error) {
      if (!(error instanceof InvalidOfferParameterError)) throw error;

      expect(error.parameter).toBe("tick");
      expect(error.value).toBe("not-a-tick");
      return;
    }

    expect.unreachable("Expected invalid offer parameter.");
  });

  test.each([
    ["tick", { tick: -1n }],
    ["tick", { tick: MAX_TICK + 1n }],
    ["tickSpacing", { tickSpacing: 3n }],
    ["tick", { tick: 2n }],
    ["expiry", { start: 20n, expiry: 19n }],
    ["maxUnits", { maxUnits: -1n, maxAssets: 0n }],
    ["maxAssets", { maxAssets: -1n }],
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

describe("Offer.createGroup", () => {
  test("default: derives a content-addressed group id", () => {
    const offers = Offer.createGroup({
      offers: [
        offerGroupEntry({ tick: 5_000n }),
        offerGroupEntry({ tick: 5_004n }),
      ],
    });

    expect(offers).toHaveLength(2);
    expect(offers[0]!.group).toBe(offers[1]!.group);
    expect(offers[0]!.group).toBe(OfferUtils.deriveOfferGroup(offers));
  });

  test("behavior: derived group id is deterministic", () => {
    const offers = Offer.createGroup({
      offers: [
        offerGroupEntry({ tick: 5_000n }),
        offerGroupEntry({ tick: 5_004n }),
      ],
    });
    const repeated = Offer.createGroup({
      offers: [
        offerGroupEntry({ tick: 5_000n }),
        offerGroupEntry({ tick: 5_004n }),
      ],
    });

    expect(offers.map((offer) => offer.group)).toEqual(
      repeated.map((offer) => offer.group),
    );
  });

  test("behavior: keeps input order stable", () => {
    const offers = Offer.createGroup({
      offers: [
        offerGroupEntry({ tick: 5_008n }),
        offerGroupEntry({ tick: 5_000n }),
        offerGroupEntry({ tick: 5_004n }),
      ],
    });

    expect(offers.map((offer) => offer.tick)).toEqual([5_008n, 5_000n, 5_004n]);
  });

  test("behavior: preserves arbitrary input order and shared group", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: Number(MAX_TICK / 4n) }), {
          minLength: 1,
          maxLength: 12,
        }),
        (tickSteps) => {
          const ticks = tickSteps.map((step) => BigInt(step) * 4n);
          const offers = Offer.createGroup({
            offers: ticks.map((tick) => offerGroupEntry({ tick })),
          });

          expect(offers.map((offer) => offer.tick)).toEqual(ticks);
          expect(
            offers.every((offer) => offer.group === offers[0]!.group),
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("error: InvalidOfferGroupError for empty groups", () => {
    expect(() => Offer.createGroup({ offers: [] })).toThrow(
      InvalidOfferGroupError,
    );
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

  test("behavior: allows API-publication-only differences", () => {
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
            duration: fc.integer({ min: 0, max: 1_000 }),
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
      "group",
      [
        Offer.create(buildOfferParams()),
        Offer.create(buildOfferParams({ group: otherGroup })),
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

describe("OfferUtils.validateOfferGroupForApiPublication", () => {
  test("default", () => {
    const offers = Offer.createGroup({
      offers: [
        offerGroupEntry({ tick: 5_000n }),
        offerGroupEntry({ tick: 5_004n }),
      ],
    });

    expect(OfferUtils.validateOfferGroupForApiPublication({ offers })).toEqual(
      offers,
    );
  });

  test("error: InvalidOfferGroupError for non-content-addressed group", () => {
    const offers = [
      Offer.create(buildOfferParams({ tick: 5_000n })),
      Offer.create(buildOfferParams({ tick: 5_004n })),
    ];

    expect(() =>
      OfferUtils.validateOfferGroupForApiPublication({ offers }),
    ).toThrow(InvalidOfferGroupError);
  });
});

describe("TakeableOfferUtils.createMany", () => {
  test("default", () => {
    const takeableOffers = TakeableOfferUtils.createMany({
      entries: [
        {
          units: "42",
          ratifierData: "0x",
          offer: baseOffer({ buy: true }),
        },
      ],
      expectedOfferSide: "buy",
      enforceSameMarket: true,
    });

    expect(takeableOffers[0]!.units).toBe(42n);
    expect(takeableOffers[0]!.offer.buy).toBe(true);
  });

  test("error: NoMatchingOffersError", () => {
    expect(() => TakeableOfferUtils.createMany({ entries: [] })).toThrow(
      NoMatchingOffersError,
    );
  });

  test("error: UnexpectedOfferSideError", () => {
    expect(() =>
      TakeableOfferUtils.createMany({
        entries: [
          { units: 1n, ratifierData: "0x", offer: baseOffer({ buy: false }) },
        ],
        expectedOfferSide: "buy",
      }),
    ).toThrow(UnexpectedOfferSideError);
  });

  test("error: InconsistentMarketError", () => {
    expect(() =>
      TakeableOfferUtils.createMany({
        entries: [
          { units: 1n, ratifierData: "0x", offer: baseOffer() },
          {
            units: 1n,
            ratifierData: "0x",
            offer: baseOffer({
              market: {
                ...baseMarketParamsInput(),
                maturity: 3_000n,
              },
            }),
          },
        ],
        enforceSameMarket: true,
      }),
    ).toThrow(InconsistentMarketError);
  });
});

describe("TakeableOffer.createMany", () => {
  test("default", () => {
    const takeableOffers = TakeableOffer.createMany({
      entries: [
        {
          units: "42",
          ratifierData: "0x",
          offer: baseOffer({ buy: true }),
        },
      ],
    });

    expect(takeableOffers[0]).toBeInstanceOf(TakeableOffer);
    expect(takeableOffers[0]!.offer).toBeInstanceOf(Offer);
    expect(takeableOffers[0]!.units).toBe(42n);
  });
});
