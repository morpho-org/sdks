import fc from "fast-check";
import { zeroAddress, zeroHash } from "viem";
import { describe, expect, test } from "vitest";
import {
  addresses,
  baseMarketParamsInput,
  baseOffer,
  baseOfferInput,
  group,
} from "../__test__/fixtures.js";
import { MAX_CONTINUOUS_FEE, MAX_TICK } from "../constants.js";
import {
  InvalidOfferGroupError,
  InvalidOfferParameterError,
} from "../errors.js";
import { MarketParams } from "../market/index.js";
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

describe("Offer", () => {
  test("default", () => {
    const offer = new Offer(baseOfferInput());

    expect(offer).toBeInstanceOf(Offer);
    expect(offer.market.loanToken).toBe(addresses.loanToken);
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
  });

  test("error: invalid bigint input", () => {
    expect(() =>
      Offer.create(buildOfferParams({ tick: "not-a-tick" })),
    ).toThrow(SyntaxError);
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
    const struct = OfferUtils.toStruct({ offer });

    expect(struct.market).not.toBe(offer.market);
    expect(struct.market).not.toBeInstanceOf(MarketParams);
    expect(struct.market.collateralParams).not.toBe(
      offer.market.collateralParams,
    );
    expect(struct.market.collateralParams[0]).not.toBe(
      offer.market.collateralParams[0],
    );

    TreeUtils.buildDescriptor([offer]);

    expect(Object.isFrozen(offer.market)).toBe(false);
    expect(Object.isFrozen(offer.market.collateralParams)).toBe(false);
    expect(Object.isFrozen(offer.market.collateralParams[0])).toBe(false);
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
