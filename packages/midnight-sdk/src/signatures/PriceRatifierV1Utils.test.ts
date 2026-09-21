import {
  type Address,
  decodeFunctionData,
  hashStruct,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import { createFixtures } from "../__test__/fixtures.js";
import { priceRatifierV1Abi } from "../abis.js";
import { InvalidTreeError, RatifierV1TakerNotAllowedError } from "../errors.js";
import type { IOffer } from "../offers/index.js";
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
    expect(decoded.allowedTaker.toLowerCase()).toBe(allowedTaker.toLowerCase());
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
});
