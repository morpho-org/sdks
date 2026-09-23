import { MathLib } from "@morpho-org/morpho-ts";
import * as fc from "fast-check";
import {
  type Address,
  bytesToHex,
  decodeFunctionData,
  getAddress,
  type Hex,
  hashStruct,
  isAddressEqual,
  keccak256,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import { createFixtures } from "../__test__/fixtures.js";
import { rateRatifierV1Abi } from "../abis.js";
import {
  InvalidOfferGroupError,
  InvalidRateRatifierV1RateError,
  InvalidRateRatifierV1TickError,
  InvalidRateRatifierV1TimeError,
  InvalidRatifierV1AddressError,
  InvalidTreeError,
  InvalidTreeHeightError,
  RatifierV1TakerNotAllowedError,
} from "../errors.js";
import { TickLib } from "../math/index.js";
import { type IOffer, OfferUtils } from "../offers/index.js";
import { GroupUtils } from "./GroupUtils.js";
import { EMPTY_OFFER_STRUCT, isZeroAddress } from "./offerStructInternal.js";
import { RateRatifierV1 } from "./RateRatifierV1.js";

const rateRatifier = "0x000000000000000000000000000000000000a111" as const;
const otherRatifier = "0x000000000000000000000000000000000000A222" as const;
const allowedTaker = "0x000000000000000000000000000000000000A000" as const;
const midnight = "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A" as const;
const { baseMarket, baseOffer } = createFixtures({
  midnight,
  ecrecoverRatifier: "0x0000000000000000000000000000000000004000",
});

const deterministicOffer: IOffer = {
  market: {
    chainId: 8453,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken: "0x0000000000000000000000000000000000006000",
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000007000",
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity: 54000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  buy: false,
  maker: "0x0000000000000000000000000000000000009000",
  start: 0n,
  expiry: 3600n,
  tick: 5000n,
  group: "0x1111111111111111111111111111111111111111111111111111111111111111",
  callback: zeroAddress,
  callbackData: "0x",
  receiverIfMakerIsSeller: zeroAddress,
  ratifier: "0x0000000000000000000000000000000000004000",
  reduceOnly: false,
  maxUnits: 100n,
  maxAssets: 0n,
  continuousFeeCap: 0n,
};

const leaf = (overrides: Parameters<typeof baseOffer>[0] = {}, rate = 0n) => ({
  offer: baseOffer({ maxAssets: 0n, ratifier: rateRatifier, ...overrides }),
  rate,
});

const eip712Types = {
  CollateralParams: [
    { name: "token", type: "address" },
    { name: "lltv", type: "uint256" },
    { name: "liquidationCursor", type: "uint256" },
    { name: "oracle", type: "address" },
  ],
  Market: [
    { name: "chainId", type: "uint256" },
    { name: "midnight", type: "address" },
    { name: "loanToken", type: "address" },
    { name: "collateralParams", type: "CollateralParams[]" },
    { name: "maturity", type: "uint256" },
    { name: "rcfThreshold", type: "uint256" },
    { name: "enterGate", type: "address" },
    { name: "liquidatorGate", type: "address" },
  ],
  RateRatifierV1Offer: [
    { name: "market", type: "Market" },
    { name: "buy", type: "bool" },
    { name: "maker", type: "address" },
    { name: "start", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "rate", type: "uint256" },
    { name: "allowedTaker", type: "address" },
    { name: "group", type: "bytes32" },
    { name: "callback", type: "address" },
    { name: "callbackData", type: "bytes" },
    { name: "receiverIfMakerIsSeller", type: "address" },
    { name: "ratifier", type: "address" },
    { name: "reduceOnly", type: "bool" },
    { name: "maxUnits", type: "uint128" },
    { name: "maxAssets", type: "uint128" },
    { name: "continuousFeeCap", type: "uint256" },
  ],
} as const;

describe("RateRatifierV1.hashLeaf", () => {
  test("default", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      { offer: leaf().offer, rate: 123456789012345n, allowedTaker },
    ]);
    const struct = descriptor.entries[0]!;

    expect(RateRatifierV1.hashLeaf(struct)).toBe(
      hashStruct({
        data: {
          ...struct.offer,
          rate: struct.rate,
          allowedTaker: struct.allowedTaker,
        },
        primaryType: "RateRatifierV1Offer",
        types: eip712Types,
      }),
    );
  });

  // HashLib vectors generated from Midnight commit 11f3d984b53286fd9137eb89e5d1385e23fe1b30.
  test("behavior: matches HashLib vector", () => {
    const rate = 920000000000000000n;
    const allowed = "0x0000000000000000000000000000000000009999" as const;
    const restricted = RateRatifierV1.buildDescriptor([
      { offer: deterministicOffer, rate, allowedTaker: allowed },
    ]).entries[0]!;
    const unrestricted = RateRatifierV1.buildDescriptor([
      { offer: deterministicOffer, rate },
    ]).entries[0]!;

    expect(RateRatifierV1.hashLeaf(restricted)).toBe(
      "0xff5284f177648bada55149e7bf5ea4d1adaa541f3cb2f25cc43781eabec436ee",
    );
    expect(RateRatifierV1.hashLeaf(unrestricted)).toBe(
      "0x503acc925a83b77fa5fba0433af49dc25e077fe8b1d68dee5c13cc03cccfe281",
    );
  });

  test("behavior: rate changes the leaf hash", () => {
    const offer = leaf().offer;
    const zero = RateRatifierV1.hashLeaf({
      offer: { ...offer, group: offer.group },
      rate: 0n,
      allowedTaker: zeroAddress,
    });
    const nonZero = RateRatifierV1.hashLeaf({
      offer: { ...offer, group: offer.group },
      rate: 1n,
      allowedTaker: zeroAddress,
    });

    expect(zero).not.toBe(nonZero);
  });
});

describe("RateRatifierV1.buildDescriptor", () => {
  test("default", () => {
    const descriptor = RateRatifierV1.buildDescriptor([leaf()]);

    expect(descriptor.height).toBe(0);
    expect(descriptor.entries).toHaveLength(1);
    expect(descriptor.offers).toHaveLength(1);
    expect(descriptor.root).toBe(descriptor.leaves[0]);
  });

  test("behavior: pads to the next power of two", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf({ maxUnits: 1n }),
      leaf({ maxUnits: 2n }),
      leaf({ maxUnits: 3n }),
    ]);

    expect(descriptor.height).toBe(2);
    expect(descriptor.entries).toHaveLength(4);
    expect(descriptor.offers).toHaveLength(3);
    expect(descriptor.entries[3]).toEqual({
      offer: EMPTY_OFFER_STRUCT,
      rate: 0n,
      allowedTaker: zeroAddress,
    });
  });

  test("error: InvalidTreeError when empty", () => {
    expect(() => RateRatifierV1.buildDescriptor([])).toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError on multiple ratifiers", () => {
    expect(() =>
      RateRatifierV1.buildDescriptor([
        leaf(),
        {
          offer: baseOffer({ maxAssets: 0n, ratifier: otherRatifier }),
          rate: 0n,
        },
      ]),
    ).toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError on duplicate leaves", () => {
    const l = leaf();
    expect(() => RateRatifierV1.buildDescriptor([l, { ...l }])).toThrow(
      InvalidTreeError,
    );
  });

  test("error: InvalidRateRatifierV1RateError on negative rate", () => {
    expect(() => RateRatifierV1.buildDescriptor([leaf({}, -1n)])).toThrow(
      InvalidRateRatifierV1RateError,
    );
  });

  test("behavior: MIN_TICK is the tick whose price is 0.5 WAD", () => {
    expect(RateRatifierV1.MIN_TICK).toBe(3372n);
    expect(() =>
      RateRatifierV1.buildDescriptor([leaf({ tick: RateRatifierV1.MIN_TICK })]),
    ).not.toThrow();
  });

  test("error: InvalidRateRatifierV1TickError on tick below MIN_TICK", () => {
    for (const tick of [0n, RateRatifierV1.MIN_TICK - 1n]) {
      expect(() => RateRatifierV1.buildDescriptor([leaf({ tick })])).toThrow(
        InvalidRateRatifierV1TickError,
      );
    }
  });

  test("behavior: does not deep-freeze offer instances", () => {
    const offer = leaf().offer;
    const descriptor = RateRatifierV1.buildDescriptor([{ offer, rate: 0n }]);

    expect(Object.isFrozen(offer)).toBe(false);
    expect(Object.isFrozen(descriptor.offers[0])).toBe(false);
    expect(offer.hash).toBe(OfferUtils.hash(offer));
    expect(descriptor.offers[0]!.hash).toBe(
      OfferUtils.hash(descriptor.offers[0]!),
    );
  });

  test("behavior: defaults group to the rate-aware singleton id", () => {
    const l = leaf({}, 5n);
    const [offer] = RateRatifierV1.buildDescriptor([l]).offers;

    expect(offer!.group).toBe(RateRatifierV1.groupId([l]));
    expect(offer!.group).toBe(
      keccak256(
        RateRatifierV1.hashLeaf({
          offer: OfferUtils.toStruct({ offer: l.offer, group: zeroHash }),
          rate: 5n,
          allowedTaker: zeroAddress,
        }),
      ),
    );
    expect(offer!.group).not.toBe(l.offer.group);
    expect(RateRatifierV1.groupId([{ ...l, rate: 6n }])).not.toBe(offer!.group);
    expect(RateRatifierV1.groupId([{ ...l, allowedTaker }])).not.toBe(
      offer!.group,
    );
  });

  test("behavior: default group commits the leaf allowedTaker", () => {
    const l = { ...leaf({}, 5n), allowedTaker };
    const [offer] = RateRatifierV1.buildDescriptor([l]).offers;

    expect(offer!.group).toBe(RateRatifierV1.groupId([l]));
    expect(offer!.group).not.toBe(
      RateRatifierV1.groupId([{ ...l, allowedTaker: zeroAddress }]),
    );
  });

  test("error: InvalidTreeError on default-group leaves differing only by tick", () => {
    expect(() =>
      RateRatifierV1.buildDescriptor([
        leaf({ tick: 5_000n }, 5n),
        leaf({ tick: 5_004n }, 5n),
      ]),
    ).toThrow(InvalidTreeError);
  });

  test("behavior: commits an explicit group as-is", () => {
    const group = keccak256("0x01");
    const l = { ...leaf(), offer: { ...leaf().offer, group } };
    const [offer] = RateRatifierV1.buildDescriptor([l]).offers;

    expect(offer!.group).toBe(group);
    expect(offer!.hasExplicitGroup).toBe(true);
  });

  test("behavior: groupId is order-independent across leaves", () => {
    const a = leaf({}, 1n);
    const b = leaf({ maxUnits: 7n }, 2n);

    expect(RateRatifierV1.groupId([a, b])).toBe(RateRatifierV1.groupId([b, a]));
    expect(RateRatifierV1.groupId([a, b])).toBe(
      GroupUtils.hashMembers([
        RateRatifierV1.memberHash(a),
        RateRatifierV1.memberHash(b),
      ]),
    );
    expect(() => RateRatifierV1.groupId([])).toThrow(InvalidOfferGroupError);
  });

  test("error: InvalidRateRatifierV1RateError from memberHash and groupId", () => {
    const negative = { offer: baseOffer, rate: -1n };
    expect(() => RateRatifierV1.memberHash(negative)).toThrow(
      InvalidRateRatifierV1RateError,
    );
    expect(() => RateRatifierV1.groupId([negative])).toThrow(
      InvalidRateRatifierV1RateError,
    );
  });

  test("error: InvalidTreeError for a tampered descriptor root", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf(),
      leaf({ maxUnits: 7n }),
    ]);

    expect(() =>
      RateRatifierV1.ratify({
        tree: { ...descriptor, root: zeroHash },
      }),
    ).toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError for a tampered descriptor leaf", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf(),
      leaf({ maxUnits: 7n }),
    ]);

    expect(() =>
      RateRatifierV1.ratify({
        tree: {
          ...descriptor,
          leaves: [zeroHash, ...descriptor.leaves.slice(1)],
        },
      }),
    ).toThrow(InvalidTreeError);
  });
});

describe("RateRatifierV1 ratifier data", () => {
  test("default: encode/decode round-trip", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.bigInt({ min: 0n, max: 3n }),
        fc.bigInt({ min: 0n }),
        fc.constantFrom(
          "0x0000000000000000000000000000000000000000" as Address,
          allowedTaker,
        ),
        (...args) => {
          const [rootBytes, leafIndex, rate, taker] = args;
          const data = RateRatifierV1.encodeRatifierData({
            root: bytesToHex(rootBytes),
            leafIndex,
            proof: [zeroHash],
            rate,
            allowedTaker: taker,
          });
          const decoded = RateRatifierV1.decodeRatifierData(data);

          expect(decoded.leafIndex).toBe(leafIndex);
          expect(decoded.rate).toBe(rate);
          expect(isAddressEqual(decoded.allowedTaker, taker)).toBe(true);
          expect(decoded.proof).toEqual([zeroHash]);
        },
      ),
    );
  });

  test("default: ratify items verify against the tree root", () => {
    const items = RateRatifierV1.ratify({
      tree: [leaf({}, 5n), leaf({ maxUnits: 7n }, 6n)],
    });

    expect(items).toHaveLength(2);
    for (const item of items) {
      const decoded = RateRatifierV1.verifyRatifierData({
        offer: item.offer,
        ratifierData: item.ratifierData,
      });
      expect(decoded.rate).toBeGreaterThanOrEqual(5n);
    }
  });

  test("behavior: ratifies a padded descriptor", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf({ maxUnits: 1n }, 5n),
      leaf({ maxUnits: 2n }, 6n),
      { ...leaf({ maxUnits: 3n }, 7n), allowedTaker },
    ]);

    const items = RateRatifierV1.ratify({ tree: descriptor });

    expect(items).toHaveLength(3);
    for (const [index, item] of items.entries()) {
      const decoded = RateRatifierV1.verifyRatifierData({
        offer: item.offer,
        ratifierData: item.ratifierData,
      });
      const entry = descriptor.entries[index]!;
      expect(decoded.rate).toBe(entry.rate);
      expect(decoded.allowedTaker).toBe(entry.allowedTaker);
    }
  });

  test("behavior: accepts any taker when allowedTaker is zero", () => {
    const [item] = RateRatifierV1.ratify({ tree: [leaf({}, 0n)] });

    expect(
      RateRatifierV1.verifyRatifierData({
        offer: item!.offer,
        ratifierData: item!.ratifierData,
        taker: allowedTaker,
      }).allowedTaker,
    ).toBe(zeroAddress);
  });

  test("error: RatifierV1TakerNotAllowedError for wrong taker", () => {
    const [item] = RateRatifierV1.ratify({
      tree: [{ offer: leaf().offer, rate: 0n, allowedTaker }],
    });

    expect(() =>
      RateRatifierV1.verifyRatifierData({
        offer: item!.offer,
        ratifierData: item!.ratifierData,
        taker: "0x000000000000000000000000000000000000b000",
      }),
    ).toThrow(RatifierV1TakerNotAllowedError);
  });

  test("behavior: allowed taker verifies", () => {
    const [item] = RateRatifierV1.ratify({
      tree: [{ offer: leaf().offer, rate: 0n, allowedTaker }],
    });

    expect(
      isAddressEqual(
        RateRatifierV1.verifyRatifierData({
          offer: item!.offer,
          ratifierData: item!.ratifierData,
          taker: allowedTaker,
        }).allowedTaker,
        allowedTaker,
      ),
    ).toBe(true);
  });

  test("behavior: skips taker check when taker is omitted", () => {
    const [item] = RateRatifierV1.ratify({
      tree: [{ offer: leaf().offer, rate: 0n, allowedTaker }],
    });

    expect(
      isAddressEqual(
        RateRatifierV1.verifyRatifierData({
          offer: item!.offer,
          ratifierData: item!.ratifierData,
        }).allowedTaker,
        allowedTaker,
      ),
    ).toBe(true);
  });

  test("error: InvalidTreeError when the rate does not match the leaf", () => {
    const [item] = RateRatifierV1.ratify({ tree: [leaf({}, 0n)] });
    const tampered = RateRatifierV1.encodeRatifierData({
      ...RateRatifierV1.decodeRatifierData(item!.ratifierData),
      rate: 1n,
    });

    expect(() =>
      RateRatifierV1.verifyRatifierData({
        offer: item!.offer,
        ratifierData: tampered,
      }),
    ).toThrow(InvalidTreeError);
  });
});

describe("RateRatifierV1.buildProof", () => {
  test("default", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf({}, 5n),
      leaf({ maxUnits: 7n }, 6n),
    ]);
    const proof = RateRatifierV1.buildProof({
      tree: descriptor,
      leafIndex: 1n,
    });
    const data = RateRatifierV1.encodeRatifierData({
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
      rate: descriptor.entries[1]!.rate,
      allowedTaker: descriptor.entries[1]!.allowedTaker,
    });

    expect(
      RateRatifierV1.verifyRatifierData({
        offer: descriptor.offers[1]!,
        ratifierData: data,
      }).rate,
    ).toBe(6n);
  });

  test("error: InvalidTreeError for an out-of-range leaf index", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf(),
      leaf({ maxUnits: 7n }),
    ]);

    expect(() =>
      RateRatifierV1.buildProof({ tree: descriptor, leafIndex: 2n }),
    ).toThrow(InvalidTreeError);
  });
});

describe("RateRatifierV1.ratifierData", () => {
  test("default", () => {
    const tree = RateRatifierV1.buildDescriptor([
      leaf({}, 5n),
      { offer: leaf({ maxUnits: 7n }).offer, rate: 6n, allowedTaker },
    ]);
    const data = RateRatifierV1.ratifierData({ tree, leafIndex: 1n });

    const decoded = RateRatifierV1.verifyRatifierData({
      offer: tree.offers[1]!,
      ratifierData: data,
      taker: allowedTaker,
    });
    expect(decoded.rate).toBe(6n);
    expect(isAddressEqual(decoded.allowedTaker, allowedTaker)).toBe(true);
  });

  test("error: InvalidTreeError for an out-of-range leaf index", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf(),
      leaf({ maxUnits: 7n }),
    ]);

    expect(() =>
      RateRatifierV1.ratifierData({ tree: descriptor, leafIndex: 2n }),
    ).toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeHeightError for an unsupported descriptor height", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf(),
      leaf({ maxUnits: 7n }),
    ]);

    expect(() =>
      RateRatifierV1.ratify({ tree: { ...descriptor, height: 21 } }),
    ).toThrow(InvalidTreeHeightError);
  });

  test("error: InvalidTreeError for truncated descriptor leaves", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf(),
      leaf({ maxUnits: 7n }),
    ]);

    expect(() =>
      RateRatifierV1.ratify({
        tree: { ...descriptor, leaves: descriptor.leaves.slice(0, 1) },
      }),
    ).toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError for swapped descriptor entries", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf(),
      leaf({ maxUnits: 7n }),
    ]);

    expect(() =>
      RateRatifierV1.ratify({
        tree: {
          ...descriptor,
          entries: [descriptor.entries[1]!, descriptor.entries[0]!],
        },
      }),
    ).toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError for a non-padding entry hidden in padding", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf(),
      leaf({ maxUnits: 7n }),
      leaf({ maxUnits: 8n }),
    ]);

    expect(() =>
      RateRatifierV1.ratify({
        tree: {
          ...descriptor,
          entries: [...descriptor.entries.slice(0, 3), descriptor.entries[0]!],
        },
      }),
    ).toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError for an empty descriptor offer list", () => {
    const descriptor = RateRatifierV1.buildDescriptor([leaf()]);

    expect(() =>
      RateRatifierV1.ratify({ tree: { ...descriptor, offers: [] } }),
    ).toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError for padding in the visible offer slots", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf(),
      leaf({ maxUnits: 7n }),
      leaf({ maxUnits: 8n }),
    ]);

    expect(() =>
      RateRatifierV1.ratify({
        tree: {
          ...descriptor,
          offers: [...descriptor.offers, descriptor.offers[0]!],
        },
      }),
    ).toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError for mixed descriptor ratifiers", () => {
    const descriptor = RateRatifierV1.buildDescriptor([
      leaf(),
      leaf({ maxUnits: 7n }),
    ]);
    const entry = descriptor.entries[1]!;

    expect(() =>
      RateRatifierV1.ratify({
        tree: {
          ...descriptor,
          entries: [
            descriptor.entries[0]!,
            {
              ...entry,
              offer: { ...entry.offer, ratifier: otherRatifier },
            },
          ],
        },
      }),
    ).toThrow(InvalidTreeError);
  });
});

describe("RateRatifierV1.priceBound", () => {
  test("default: zero rate or zero time returns WAD", () => {
    expect(
      RateRatifierV1.priceBound({
        rate: 0n,
        timeToMaturity: 100n,
        buy: true,
      }),
    ).toBe(MathLib.WAD);
    expect(
      RateRatifierV1.priceBound({
        rate: 10n,
        timeToMaturity: 0n,
        buy: false,
      }),
    ).toBe(MathLib.WAD);
  });

  test("behavior: buy rounds down and sell rounds up", () => {
    // WAD * WAD / (WAD + 1) = WAD - 1 with a remainder.
    const denominator = MathLib.WAD + 1n;

    expect(
      RateRatifierV1.priceBound({
        rate: 1n,
        timeToMaturity: 1n,
        buy: true,
      }),
    ).toBe(MathLib.mulDivDown(MathLib.WAD, MathLib.WAD, denominator));
    expect(
      RateRatifierV1.priceBound({
        rate: 1n,
        timeToMaturity: 1n,
        buy: false,
      }),
    ).toBe(MathLib.mulDivUp(MathLib.WAD, MathLib.WAD, denominator));
  });

  test("error: InvalidRateRatifierV1RateError on negative rate", () => {
    expect(() =>
      RateRatifierV1.priceBound({
        rate: -1n,
        timeToMaturity: 0n,
        buy: true,
      }),
    ).toThrow(InvalidRateRatifierV1RateError);
  });

  test("error: InvalidRateRatifierV1TimeError on negative time to maturity", () => {
    expect(() =>
      RateRatifierV1.priceBound({
        rate: 0n,
        timeToMaturity: -1n,
        buy: true,
      }),
    ).toThrow(InvalidRateRatifierV1TimeError);
  });
});

describe("RateRatifierV1.isPriceAcceptable", () => {
  const input = leaf();
  const offer = input.offer;

  test("default: buy offer at or below the bound is acceptable", () => {
    expect(
      RateRatifierV1.isPriceAcceptable({
        offer,
        rate: 0n,
        timestamp: 0n,
      }),
    ).toBe(TickLib.tickToPrice(offer.tick) <= MathLib.WAD);
  });

  test("behavior: matured market compares against WAD", () => {
    const maturedOffer = leaf({
      market: { ...offer.market, maturity: 0n },
    }).offer;
    const price = TickLib.tickToPrice(maturedOffer.tick);

    expect(
      RateRatifierV1.isPriceAcceptable({
        offer: maturedOffer,
        rate: MathLib.WAD,
        timestamp: 1n,
      }),
    ).toBe(price <= MathLib.WAD);
  });

  test("behavior: sell offer below the bound is rejected", () => {
    const sellOffer = leaf({ buy: false, maxUnits: 100n, maxAssets: 0n }).offer;
    const bound = MathLib.mulDivUp(
      MathLib.WAD,
      MathLib.WAD,
      MathLib.WAD + MathLib.WAD * 1n,
    );
    const acceptable = RateRatifierV1.isPriceAcceptable({
      offer: sellOffer,
      rate: MathLib.WAD,
      timestamp: 1n,
    });

    expect(acceptable).toBe(TickLib.tickToPrice(sellOffer.tick) >= bound);
  });

  test("behavior: matches the plain-market result for a hydrated Market entity", () => {
    const market = baseMarket();
    const entityOffer = leaf({ market }).offer;
    const plainOffer = leaf({ market: market.params }).offer;
    const params = { rate: MathLib.WAD, timestamp: 1n } as const;

    expect(
      RateRatifierV1.isPriceAcceptable({ offer: entityOffer, ...params }),
    ).toBe(RateRatifierV1.isPriceAcceptable({ offer: plainOffer, ...params }));
  });

  test("error: InvalidRateRatifierV1RateError on negative rate", () => {
    expect(() =>
      RateRatifierV1.isPriceAcceptable({
        offer,
        rate: -1n,
        timestamp: 0n,
      }),
    ).toThrow(InvalidRateRatifierV1RateError);
  });

  test("error: InvalidRateRatifierV1TimeError on negative timestamp", () => {
    expect(() =>
      RateRatifierV1.isPriceAcceptable({
        offer,
        rate: 0n,
        timestamp: -1n,
      }),
    ).toThrow(InvalidRateRatifierV1TimeError);
  });
});

describe("RateRatifierV1.encodeSetIsRootRatified", () => {
  test("default", () => {
    const call = RateRatifierV1.encodeSetIsRootRatified({
      ratifier: rateRatifier,
      maker: "0x0000000000000000000000000000000000009000",
      root: zeroHash,
      isRatified: true,
    });

    expect(call.to).toBe(rateRatifier);
    expect(
      decodeFunctionData({ abi: rateRatifierV1Abi, data: call.data }),
    ).toEqual({
      functionName: "setIsRootRatified",
      args: ["0x0000000000000000000000000000000000009000", zeroHash, true],
    });
  });

  test("behavior: encodes arbitrary arguments that decode identically", () => {
    const fcAddress = fc
      .uint8Array({ minLength: 20, maxLength: 20 })
      .map((bytes) => bytesToHex(bytes) as Address);
    const fcNonZeroAddress = fcAddress.filter(
      (address) => !isZeroAddress(address),
    );
    const fcBytes32 = fc
      .uint8Array({ minLength: 32, maxLength: 32 })
      .map((bytes) => bytesToHex(bytes) as Hex);

    fc.assert(
      fc.property(
        fcNonZeroAddress,
        fcAddress,
        fcBytes32,
        fc.boolean(),
        (...args) => {
          const [ratifier, maker, root, isRatified] = args;
          const call = RateRatifierV1.encodeSetIsRootRatified({
            ratifier,
            maker,
            root,
            isRatified,
          });

          expect(call.to).toBe(ratifier);
          expect(
            decodeFunctionData({ abi: rateRatifierV1Abi, data: call.data }),
          ).toEqual({
            functionName: "setIsRootRatified",
            args: [getAddress(maker), root, isRatified],
          });
        },
      ),
    );
  });

  test("error: InvalidRatifierV1AddressError for a zero ratifier address", () => {
    expect(() =>
      RateRatifierV1.encodeSetIsRootRatified({
        ratifier: zeroAddress,
        maker: "0x0000000000000000000000000000000000009000",
        root: zeroHash,
        isRatified: true,
      }),
    ).toThrow(InvalidRatifierV1AddressError);
  });
});
