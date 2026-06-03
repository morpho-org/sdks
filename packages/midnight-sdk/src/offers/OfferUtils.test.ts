import { describe, expect, test } from "vitest";
import {
  addresses,
  baseMarketInput,
  baseOffer,
  baseOfferInput,
  group,
} from "../__test__/fixtures.js";
import {
  InconsistentMarketError,
  MissingOfferGroupError,
  NoMatchingOffersError,
  UnexpectedOfferSideError,
} from "../errors.js";
import { Offer } from "./Offer.js";
import { OfferUtils } from "./OfferUtils.js";
import { Take } from "./Take.js";

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
    expect(offer.receiverIfMakerIsSeller).toBe(addresses.maker);
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
