import * as fc from "fast-check";
import {
  type Address,
  bytesToHex,
  decodeFunctionData,
  getAddress,
  type Hex,
  hashStruct,
  isAddressEqual,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import { createFixtures } from "../__test__/fixtures.js";
import { priceRatifierV1Abi } from "../abis.js";
import {
  InvalidRatifierV1AddressError,
  InvalidTreeError,
  RatifierV1TakerNotAllowedError,
} from "../errors.js";
import { type IOffer, OfferUtils } from "../offers/index.js";
import { isZeroAddress } from "./offerStructInternal.js";
import { PriceRatifierV1Utils } from "./PriceRatifierV1Utils.js";

const priceRatifier = "0x000000000000000000000000000000000000a111" as Address;
const allowedTaker = "0x000000000000000000000000000000000000A000" as Address;
const { baseOffer } = createFixtures({
  midnight: "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
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

const offer = (overrides: Parameters<typeof baseOffer>[0] = {}) =>
  baseOffer({ maxAssets: 0n, ratifier: priceRatifier, ...overrides });

describe("PriceRatifierV1Utils.hashLeaf", () => {
  // HashLib vectors generated from Midnight commit 11f3d984b53286fd9137eb89e5d1385e23fe1b30.
  test("behavior: matches HashLib vector", () => {
    const allowed = "0x0000000000000000000000000000000000009999" as const;
    const restricted = PriceRatifierV1Utils.buildDescriptor([
      { offer: deterministicOffer, allowedTaker: allowed },
    ]).entries[0]!;
    const unrestricted = PriceRatifierV1Utils.buildDescriptor([
      { offer: deterministicOffer },
    ]).entries[0]!;

    expect(PriceRatifierV1Utils.hashLeaf(restricted)).toBe(
      "0x3b9d550f526f27f2aa1ab2d2bd01141c673c3c23fedce0b845fc599e7cc3d9d9",
    );
    expect(PriceRatifierV1Utils.hashLeaf(unrestricted)).toBe(
      "0x3ace6c15bfbde4463a1f571522e63e7d3138e2cf6d4b1cb80c8c93d247df7d30",
    );
  });

  test("default", () => {
    const input = { offer: offer(), allowedTaker };
    const descriptor = PriceRatifierV1Utils.buildDescriptor([input]);
    const struct = descriptor.entries[0]!;
    expect(PriceRatifierV1Utils.hashLeaf(struct)).toBe(
      hashStruct({
        primaryType: "PriceRatifierV1Offer",
        types: {
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
          PriceRatifierV1Offer: [
            { name: "market", type: "Market" },
            { name: "buy", type: "bool" },
            { name: "maker", type: "address" },
            { name: "start", type: "uint256" },
            { name: "expiry", type: "uint256" },
            { name: "tick", type: "uint256" },
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
        },
        data: {
          ...struct.offer,
          allowedTaker: struct.allowedTaker,
        },
      }),
    );
  });
});

describe("PriceRatifierV1Utils.buildDescriptor", () => {
  test("default", () => {
    const descriptor = PriceRatifierV1Utils.buildDescriptor([
      { offer: offer() },
    ]);
    expect(descriptor.height).toBe(0);
    expect(descriptor.root).toBe(descriptor.leaves[0]);
  });

  test("behavior: pads three leaves", () => {
    const descriptor = PriceRatifierV1Utils.buildDescriptor([
      { offer: offer({ maxUnits: 1n }) },
      { offer: offer({ maxUnits: 2n }) },
      { offer: offer({ maxUnits: 3n }) },
    ]);
    expect(descriptor.height).toBe(2);
    expect(descriptor.entries).toHaveLength(4);
    expect(descriptor.entries[3]?.allowedTaker).toBe(zeroAddress);
  });

  test("error: InvalidTreeError for empty or mixed ratifiers", () => {
    expect(() => PriceRatifierV1Utils.buildDescriptor([])).toThrow(
      InvalidTreeError,
    );
    expect(() =>
      PriceRatifierV1Utils.buildDescriptor([
        { offer: offer() },
        {
          offer: baseOffer({
            maxAssets: 0n,
            ratifier: "0x000000000000000000000000000000000000A222",
          }),
        },
      ]),
    ).toThrow(InvalidTreeError);
  });

  test("behavior: does not deep-freeze offer instances", () => {
    const input = offer();
    const descriptor = PriceRatifierV1Utils.buildDescriptor([{ offer: input }]);

    expect(input.hash).toBe(OfferUtils.hash(input));
    expect(descriptor.offers[0]!.hash).toBe(input.hash);
  });

  test("error: InvalidTreeError for a tampered descriptor root", () => {
    const descriptor = PriceRatifierV1Utils.buildDescriptor([
      { offer: offer() },
      { offer: offer({ maxUnits: 7n }) },
    ]);

    expect(() =>
      PriceRatifierV1Utils.ratify({
        tree: { ...descriptor, root: zeroHash },
      }),
    ).toThrow(InvalidTreeError);
  });

  test("error: InvalidTreeError for a tampered descriptor leaf", () => {
    const descriptor = PriceRatifierV1Utils.buildDescriptor([
      { offer: offer() },
      { offer: offer({ maxUnits: 7n }) },
    ]);

    expect(() =>
      PriceRatifierV1Utils.ratify({
        tree: {
          ...descriptor,
          leaves: [zeroHash, ...descriptor.leaves.slice(1)],
        },
      }),
    ).toThrow(InvalidTreeError);
  });
});

describe("PriceRatifierV1Utils ratifier data", () => {
  test("default: ratify and verify", () => {
    const [item] = PriceRatifierV1Utils.ratify({
      tree: [{ offer: offer(), allowedTaker }],
    });
    const decoded = PriceRatifierV1Utils.verifyRatifierData({
      offer: item!.offer,
      ratifierData: item!.ratifierData,
      taker: allowedTaker,
    });
    expect(isAddressEqual(decoded.allowedTaker, allowedTaker)).toBe(true);
  });

  test("behavior: ratifies a padded descriptor", () => {
    const descriptor = PriceRatifierV1Utils.buildDescriptor([
      { offer: offer({ maxUnits: 1n }) },
      { offer: offer({ maxUnits: 2n }), allowedTaker },
      { offer: offer({ maxUnits: 3n }) },
    ]);

    const items = PriceRatifierV1Utils.ratify({ tree: descriptor });

    expect(items).toHaveLength(3);
    for (const [index, item] of items.entries()) {
      const decoded = PriceRatifierV1Utils.verifyRatifierData({
        offer: item.offer,
        ratifierData: item.ratifierData,
      });
      expect(decoded.allowedTaker).toBe(
        descriptor.entries[index]!.allowedTaker,
      );
    }
  });

  test("behavior: zero taker restriction accepts any taker", () => {
    const [item] = PriceRatifierV1Utils.ratify({ tree: [{ offer: offer() }] });
    expect(
      PriceRatifierV1Utils.verifyRatifierData({
        offer: item!.offer,
        ratifierData: item!.ratifierData,
        taker: allowedTaker,
      }).allowedTaker,
    ).toBe(zeroAddress);
  });

  test("error: RatifierV1TakerNotAllowedError", () => {
    const [item] = PriceRatifierV1Utils.ratify({
      tree: [{ offer: offer(), allowedTaker }],
    });
    expect(() =>
      PriceRatifierV1Utils.verifyRatifierData({
        offer: item!.offer,
        ratifierData: item!.ratifierData,
        taker: "0x000000000000000000000000000000000000b000",
      }),
    ).toThrow(RatifierV1TakerNotAllowedError);
  });

  test("behavior: skips taker check when taker is omitted", () => {
    const [item] = PriceRatifierV1Utils.ratify({
      tree: [{ offer: offer(), allowedTaker }],
    });

    expect(
      isAddressEqual(
        PriceRatifierV1Utils.verifyRatifierData({
          offer: item!.offer,
          ratifierData: item!.ratifierData,
        }).allowedTaker,
        allowedTaker,
      ),
    ).toBe(true);
  });

  test("error: InvalidTreeError for wrong offer", () => {
    const [item] = PriceRatifierV1Utils.ratify({ tree: [{ offer: offer() }] });
    expect(() =>
      PriceRatifierV1Utils.verifyRatifierData({
        offer: offer({ maxUnits: 99n }),
        ratifierData: item!.ratifierData,
      }),
    ).toThrow(InvalidTreeError);
  });
});

describe("PriceRatifierV1Utils.buildProof", () => {
  test("default", () => {
    const descriptor = PriceRatifierV1Utils.buildDescriptor([
      { offer: offer() },
      { offer: offer({ maxUnits: 7n }), allowedTaker },
    ]);
    const proof = PriceRatifierV1Utils.buildProof({
      tree: descriptor,
      leafIndex: 1n,
    });
    const data = PriceRatifierV1Utils.encodeRatifierData({
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
      allowedTaker: descriptor.entries[1]!.allowedTaker,
    });

    expect(
      isAddressEqual(
        PriceRatifierV1Utils.verifyRatifierData({
          offer: descriptor.offers[1]!,
          ratifierData: data,
          taker: allowedTaker,
        }).allowedTaker,
        allowedTaker,
      ),
    ).toBe(true);
  });

  test("error: InvalidTreeError for an out-of-range leaf index", () => {
    const descriptor = PriceRatifierV1Utils.buildDescriptor([
      { offer: offer() },
      { offer: offer({ maxUnits: 7n }) },
    ]);

    expect(() =>
      PriceRatifierV1Utils.buildProof({ tree: descriptor, leafIndex: 2n }),
    ).toThrow(InvalidTreeError);
  });
});

describe("PriceRatifierV1Utils.ratifierData", () => {
  test("default", () => {
    const tree = [
      { offer: offer() },
      { offer: offer({ maxUnits: 7n }), allowedTaker },
    ];
    const data = PriceRatifierV1Utils.ratifierData({ tree, leafIndex: 1n });

    expect(
      isAddressEqual(
        PriceRatifierV1Utils.verifyRatifierData({
          offer: tree[1]!.offer,
          ratifierData: data,
          taker: allowedTaker,
        }).allowedTaker,
        allowedTaker,
      ),
    ).toBe(true);
  });

  test("error: InvalidTreeError for an out-of-range leaf index", () => {
    const descriptor = PriceRatifierV1Utils.buildDescriptor([
      { offer: offer() },
      { offer: offer({ maxUnits: 7n }) },
    ]);

    expect(() =>
      PriceRatifierV1Utils.ratifierData({ tree: descriptor, leafIndex: 2n }),
    ).toThrow(InvalidTreeError);
  });
});

describe("PriceRatifierV1Utils ratifier data encoding", () => {
  test("default: encode/decode round-trip", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.bigInt({ min: 0n, max: 3n }),
        fc.constantFrom(
          "0x0000000000000000000000000000000000000000" as Address,
          allowedTaker,
        ),
        (...args) => {
          const [rootBytes, leafIndex, taker] = args;
          const data = PriceRatifierV1Utils.encodeRatifierData({
            root: bytesToHex(rootBytes),
            leafIndex,
            proof: [zeroHash],
            allowedTaker: taker,
          });
          const decoded = PriceRatifierV1Utils.decodeRatifierData(data);

          expect(decoded.root).toBe(bytesToHex(rootBytes));
          expect(decoded.leafIndex).toBe(leafIndex);
          expect(isAddressEqual(decoded.allowedTaker, taker)).toBe(true);
          expect(decoded.proof).toEqual([zeroHash]);
        },
      ),
    );
  });
});

describe("PriceRatifierV1Utils.encodeSetIsRootRatified", () => {
  test("default", () => {
    const call = PriceRatifierV1Utils.encodeSetIsRootRatified({
      ratifier: priceRatifier,
      maker: offer().maker,
      root: zeroHash,
      isRatified: true,
    });
    expect(
      decodeFunctionData({ abi: priceRatifierV1Abi, data: call.data }),
    ).toEqual({
      functionName: "setIsRootRatified",
      args: [offer().maker, zeroHash, true],
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
          const call = PriceRatifierV1Utils.encodeSetIsRootRatified({
            ratifier,
            maker,
            root,
            isRatified,
          });

          expect(call.to).toBe(ratifier);
          expect(
            decodeFunctionData({ abi: priceRatifierV1Abi, data: call.data }),
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
      PriceRatifierV1Utils.encodeSetIsRootRatified({
        ratifier: zeroAddress,
        maker: offer().maker,
        root: zeroHash,
        isRatified: true,
      }),
    ).toThrow(InvalidRatifierV1AddressError);
  });
});
