import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  addresses,
  baseMarketInput,
  baseOffer,
  baseOfferInput,
  group,
} from "../__test__/fixtures.js";
import { MAX_TICK } from "../constants.js";
import {
  InconsistentMarketError,
  InvalidOfferGroupError,
  InvalidOfferParameterError,
  MissingOfferGroupError,
  NoMatchingOffersError,
  UnexpectedOfferSideError,
} from "../errors.js";
import type { BuildOfferParams } from "./Offer.js";
import { Offer } from "./Offer.js";
import { OfferUtils } from "./OfferUtils.js";
import { Take } from "./Take.js";

const buildOfferParams = (overrides: Partial<BuildOfferParams> = {}) => ({
  market: baseMarketInput(),
  buy: true,
  maker: addresses.maker,
  tick: 5_000n,
  expiry: 2_100n,
  group,
  ratifier: addresses.ecrecoverRatifier,
  maxAssets: 100n,
  ...overrides,
});

const buildOfferGroupEntry = (
  overrides: Partial<Omit<BuildOfferParams, "group" | "getRandomValues">> = {},
): Omit<BuildOfferParams, "group" | "getRandomValues"> => ({
  market: baseMarketInput(),
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
  test("behavior: from", () => {
    const offer = baseOffer();

    expect(Offer.from(offer)).toBe(offer);
    expect(Offer.from(baseOfferInput())).toBeInstanceOf(Offer);
  });
});

describe("Take", () => {
  test("behavior: from", () => {
    const take = new Take({
      units: 1n,
      offer: baseOffer(),
      ratifierData: "0x",
    });
    const fromPlain = Take.from({
      units: "2",
      offer: baseOfferInput(),
      ratifierData: "0x",
    });

    expect(Take.from(take)).toBe(take);
    expect(fromPlain).toBeInstanceOf(Take);
    expect(fromPlain.offer).toBeInstanceOf(Offer);
  });
});

describe("OfferUtils.buildOffer", () => {
  test("default", () => {
    const offer = OfferUtils.buildOffer({
      market: baseMarketInput(),
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

  test("behavior: generates a group from an injected random source", () => {
    const offer = OfferUtils.buildOffer({
      market: baseMarketInput(),
      buy: true,
      maker: addresses.maker,
      tick: 5_000n,
      expiry: 2_100n,
      getRandomValues: (array) => {
        array.fill(0x11);
        return array;
      },
      ratifier: addresses.ecrecoverRatifier,
      maxAssets: 100n,
    });

    expect(offer.group).toBe(
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    );
  });

  test("behavior: defaults maker seller receiver for sell offers", () => {
    const offer = OfferUtils.buildOffer(
      buildOfferParams({
        buy: false,
        maxUnits: 100n,
        maxAssets: 0n,
      }),
    );

    expect(offer.receiverIfMakerIsSeller).toBe(addresses.maker);
  });

  test("behavior: accepts ticks aligned to a refined market spacing", () => {
    const offer = OfferUtils.buildOffer(
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

  test("error: MissingOfferGroupError", () => {
    expect(() =>
      OfferUtils.buildOffer({
        market: baseMarketInput(),
        buy: true,
        maker: addresses.maker,
        tick: 5_000n,
        expiry: 2_100n,
        ratifier: addresses.ecrecoverRatifier,
        maxAssets: 100n,
      }),
    ).toThrow(MissingOfferGroupError);
  });

  test("error: InvalidOfferParameterError fields", () => {
    try {
      OfferUtils.buildOffer(buildOfferParams({ tick: "not-a-tick" }));
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
      OfferUtils.buildOffer(buildOfferParams(overrides));
    } catch (error) {
      if (!(error instanceof InvalidOfferParameterError)) throw error;

      expect(error.parameter).toBe(parameter);
      return;
    }

    expect.unreachable("Expected invalid offer parameter.");
  });
});

describe("OfferUtils.buildOfferGroup", () => {
  test("default: explicit group id", () => {
    const offers = OfferUtils.buildOfferGroup({
      group,
      offers: [
        buildOfferGroupEntry({ tick: 5_000n }),
        buildOfferGroupEntry({ tick: 5_004n }),
      ],
    });

    expect(offers).toHaveLength(2);
    expect(offers[0]!.group).toBe(group);
    expect(offers[1]!.group).toBe(group);
    expect(Object.isFrozen(offers)).toBe(true);
  });

  test("behavior: generated group id is shared", () => {
    let randomCalls = 0;
    const offers = OfferUtils.buildOfferGroup({
      getRandomValues: (array) => {
        randomCalls += 1;
        array.fill(0x33);
        return array;
      },
      offers: [
        buildOfferGroupEntry({ tick: 5_000n }),
        buildOfferGroupEntry({ tick: 5_004n }),
      ],
    });

    expect(randomCalls).toBe(1);
    expect(offers.map((offer) => offer.group)).toEqual([
      "0x3333333333333333333333333333333333333333333333333333333333333333",
      "0x3333333333333333333333333333333333333333333333333333333333333333",
    ]);
  });

  test("behavior: keeps input order stable", () => {
    const offers = OfferUtils.buildOfferGroup({
      group,
      offers: [
        buildOfferGroupEntry({ tick: 5_008n }),
        buildOfferGroupEntry({ tick: 5_000n }),
        buildOfferGroupEntry({ tick: 5_004n }),
      ],
    });

    expect(offers.map((offer) => offer.tick)).toEqual([5_008n, 5_000n, 5_004n]);
  });

  test("error: InvalidOfferGroupError for empty groups", () => {
    expect(() => OfferUtils.buildOfferGroup({ group, offers: [] })).toThrow(
      InvalidOfferGroupError,
    );
  });

  test("error: MissingOfferGroupError", () => {
    expect(() =>
      OfferUtils.buildOfferGroup({ offers: [buildOfferGroupEntry()] }),
    ).toThrow(MissingOfferGroupError);
  });
});

describe("OfferUtils.validateOfferGroup", () => {
  test("default", () => {
    const offers = [
      OfferUtils.buildOffer(buildOfferParams({ tick: 5_000n })),
      OfferUtils.buildOffer(buildOfferParams({ tick: 5_004n })),
    ];

    expect(OfferUtils.validateOfferGroup({ offers })).toEqual(offers);
  });

  test("behavior: allows router-only differences", () => {
    const offers = OfferUtils.validateOfferGroup({
      offers: [
        OfferUtils.buildOffer(
          buildOfferParams({
            start: 10n,
            expiry: 2_200n,
            ratifier: addresses.ecrecoverRatifier,
          }),
        ),
        OfferUtils.buildOffer(
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

  test.each([
    [
      "maker",
      [
        OfferUtils.buildOffer(buildOfferParams()),
        OfferUtils.buildOffer(buildOfferParams({ maker: addresses.taker })),
      ],
    ],
    [
      "group",
      [
        OfferUtils.buildOffer(buildOfferParams()),
        OfferUtils.buildOffer(buildOfferParams({ group: otherGroup })),
      ],
    ],
    [
      "side",
      [
        OfferUtils.buildOffer(buildOfferParams()),
        OfferUtils.buildOffer(
          buildOfferParams({ buy: false, receiverIfMakerIsSeller: undefined }),
        ),
      ],
    ],
    [
      "caps",
      [
        OfferUtils.buildOffer(buildOfferParams()),
        OfferUtils.buildOffer(buildOfferParams({ maxAssets: 101n })),
      ],
    ],
    [
      "loan token",
      [
        OfferUtils.buildOffer(buildOfferParams()),
        OfferUtils.buildOffer(
          buildOfferParams({
            market: {
              ...baseMarketInput(),
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

describe("OfferUtils.buildTakesFromOffers", () => {
  test("default", () => {
    const takes = OfferUtils.buildTakesFromOffers({
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

    expect(takes[0]!.units).toBe(42n);
    expect(takes[0]!.offer.buy).toBe(true);
  });

  test("error: NoMatchingOffersError", () => {
    expect(() => OfferUtils.buildTakesFromOffers({ entries: [] })).toThrow(
      NoMatchingOffersError,
    );
  });

  test("error: UnexpectedOfferSideError", () => {
    expect(() =>
      OfferUtils.buildTakesFromOffers({
        entries: [
          { units: 1n, ratifierData: "0x", offer: baseOffer({ buy: false }) },
        ],
        expectedOfferSide: "buy",
      }),
    ).toThrow(UnexpectedOfferSideError);
  });

  test("error: InconsistentMarketError", () => {
    expect(() =>
      OfferUtils.buildTakesFromOffers({
        entries: [
          { units: 1n, ratifierData: "0x", offer: baseOffer() },
          {
            units: 1n,
            ratifierData: "0x",
            offer: baseOffer({
              market: {
                ...baseMarketInput(),
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
