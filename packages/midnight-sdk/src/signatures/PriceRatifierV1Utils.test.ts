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
import { PriceRatifierV1Utils } from "./PriceRatifierV1Utils.js";

const priceRatifier = "0x000000000000000000000000000000000000a111" as Address;
const allowedTaker = "0x000000000000000000000000000000000000A000" as Address;
const { baseOffer } = createFixtures({
  midnight: "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
  ecrecoverRatifier: "0x0000000000000000000000000000000000004000",
});
const offer = (overrides: Parameters<typeof baseOffer>[0] = {}) =>
  baseOffer({ maxAssets: 0n, ratifier: priceRatifier, ...overrides });

describe("PriceRatifierV1Utils.hashLeaf", () => {
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
