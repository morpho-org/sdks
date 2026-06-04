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
