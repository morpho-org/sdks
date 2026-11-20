import { fc, test as propertyTest } from "@fast-check/vitest";
import { midnightAbi } from "@morpho-org/midnight-sdk";
import {
  addressesRegistry,
  ChainId,
  getChainAddress,
  UnknownAddressError,
  UnsupportedChainIdError,
} from "@morpho-org/morpho-ts";
import {
  type Address,
  decodeFunctionData,
  type Hex,
  maxUint128,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import {
  DuplicateMidnightGroupCancellationError,
  EmptyMidnightGroupCancellationsError,
  InvalidMidnightHexInputError,
  MidnightCalldataEncodingError,
  MidnightZeroOnBehalfError,
} from "../../types/index.js";
import { midnightCancelOffers } from "./cancelOffers.js";
import { midnightSupplyCollateral } from "./supplyCollateral.js";

const groupA = `0x${"aa".repeat(32)}` as Hex;
const groupB = `0x${"bb".repeat(32)}` as Hex;
const groupC = `0x${"cc".repeat(32)}` as Hex;
const maker = midnightAddresses.maker;
const params = { chainId: midnightChainId, onBehalf: maker };

const setConsumedSelector = toFunctionSelector(
  "setConsumed(bytes32,uint128,address)",
);
const multicallSelector = toFunctionSelector("multicall(bytes[])");

/** Decodes a cancellation into its `setConsumed` argument lists, whichever encoding it uses. */
const decodeCancellations = (data: Hex) => {
  const decoded = decodeFunctionData({ abi: midnightAbi, data });
  const calls =
    decoded.functionName === "multicall"
      ? decoded.args[0].map((call) =>
          decodeFunctionData({ abi: midnightAbi, data: call }),
        )
      : [decoded];
  return calls.map((call) => {
    if (call.functionName !== "setConsumed") {
      throw new Error(`expected setConsumed, got ${call.functionName}`);
    }
    return call.args;
  });
};

describe("midnightCancelOffers", () => {
  test("default: one group encodes a bare setConsumed", () => {
    const tx = midnightCancelOffers({ ...params, groups: [groupA] });

    expect(tx.data.startsWith(setConsumedSelector)).toBe(true);
    expect(decodeFunctionData({ abi: midnightAbi, data: tx.data })).toEqual({
      functionName: "setConsumed",
      args: [groupA, maxUint128, maker],
    });
    expect(tx).toMatchInlineSnapshot(`
      {
        "action": {
          "args": {
            "groups": [
              "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            ],
            "onBehalf": "0x0000000000000000000000000000000000009000",
          },
          "type": "midnightCancelOffers",
        },
        "data": "0xf01fc06caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00000000000000000000000000000000ffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000009000",
        "to": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
        "value": 0n,
      }
    `);
  });

  test("behavior: several groups encode one multicall of setConsumed, in list order", () => {
    const groups = [groupB, groupA, groupC];
    const tx = midnightCancelOffers({ ...params, groups });

    expect(tx.data.startsWith(multicallSelector)).toBe(true);
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });
    expect(decoded.functionName).toBe("multicall");
    expect(decodeCancellations(tx.data)).toEqual(
      groups.map((group) => [group, maxUint128, maker]),
    );
    expect(tx).toMatchInlineSnapshot(`
      {
        "action": {
          "args": {
            "groups": [
              "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            ],
            "onBehalf": "0x0000000000000000000000000000000000009000",
          },
          "type": "midnightCancelOffers",
        },
        "data": "0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000000000000000000000000000000000064f01fc06cbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00000000000000000000000000000000ffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000009000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064f01fc06caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00000000000000000000000000000000ffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000009000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064f01fc06ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc00000000000000000000000000000000ffffffffffffffffffffffffffffffff000000000000000000000000000000000000000000000000000000000000900000000000000000000000000000000000000000000000000000000000",
        "to": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
        "value": 0n,
      }
    `);
  });

  test("behavior: two groups already use multicall", () => {
    const tx = midnightCancelOffers({ ...params, groups: [groupA, groupB] });

    expect(tx.data.startsWith(multicallSelector)).toBe(true);
    expect(decodeCancellations(tx.data)).toEqual([
      [groupA, maxUint128, maker],
      [groupB, maxUint128, maker],
    ]);
  });

  test("behavior: returns a deep-frozen transaction without freezing the caller's list", () => {
    const groups = [groupA, groupB];
    const tx = midnightCancelOffers({ ...params, groups });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
    expect(Object.isFrozen(tx.action.args.groups)).toBe(true);
    expect(Object.isFrozen(groups)).toBe(false);
    expect(tx.action.args.groups).toEqual(groups);
    expect(tx.value).toBe(0n);
  });

  test("behavior: reads the group list once", () => {
    let reads = 0;
    const tx = midnightCancelOffers({
      ...params,
      get groups() {
        reads += 1;
        return reads === 1 ? [groupA] : [groupA, groupA];
      },
    });

    expect(reads).toBe(1);
    expect(tx.action.args.groups).toEqual([groupA]);
  });

  test("behavior: appends metadata the way the direct collateral supply does", () => {
    const metadata = { origin: "a1b2c3d4" };
    const plain = midnightCancelOffers({ ...params, groups: [groupA] });
    const single = midnightCancelOffers({
      ...params,
      groups: [groupA],
      metadata,
    });
    const batch = midnightCancelOffers({
      ...params,
      groups: [groupA, groupB],
      metadata,
    });
    const supply = midnightSupplyCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      assets: 1n,
      onBehalf: maker,
      metadata,
    });

    expect(single.data).toBe(`${plain.data}a1b2c3d4`);
    expect(batch.data.slice(-8)).toBe(supply.data.slice(-8));
    // The suffix leaves the call matchable and decodable as the same cancellation.
    expect(single.data.startsWith(setConsumedSelector)).toBe(true);
    expect(decodeCancellations(single.data)).toEqual([
      [groupA, maxUint128, maker],
    ]);
    expect(decodeCancellations(batch.data)).toEqual([
      [groupA, maxUint128, maker],
      [groupB, maxUint128, maker],
    ]);
  });

  const midnightChainIds = Object.entries(addressesRegistry)
    .filter(([, chainAddresses]) => "midnight" in chainAddresses)
    .map(([chainId]) => Number(chainId));

  test("behavior: the registry lists Midnight on every chain with MidnightBundlesV2", () => {
    const bundleChainIds = Object.entries(addressesRegistry)
      .filter(([, chainAddresses]) => "midnightBundlesV2" in chainAddresses)
      .map(([chainId]) => Number(chainId));

    expect(midnightChainIds.length).toBeGreaterThan(0);
    expect(midnightChainIds).toEqual(expect.arrayContaining(bundleChainIds));
  });

  test.each(midnightChainIds)(
    "behavior: targets Midnight, never MidnightBundlesV2, on chain %d",
    (chainId) => {
      for (const groups of [[groupA], [groupA, groupB]]) {
        const tx = midnightCancelOffers({ chainId, groups, onBehalf: maker });

        expect(tx.to).toBe(getChainAddress(chainId, "midnight"));
        expect(decodeCancellations(tx.data)).toEqual(
          groups.map((group) => [group, maxUint128, maker]),
        );
      }
    },
  );

  test("error: EmptyMidnightGroupCancellationsError", () => {
    expect(() => midnightCancelOffers({ ...params, groups: [] })).toThrow(
      EmptyMidnightGroupCancellationsError,
    );
  });

  test.each([
    ["an exact repeat", [groupA, groupB, groupA]],
    ["a repeat in another letter case", [groupA, `0x${"AA".repeat(32)}`]],
  ] as const)(
    "error: DuplicateMidnightGroupCancellationError on %s",
    (_, groups) => {
      expect(() => midnightCancelOffers({ ...params, groups })).toThrow(
        DuplicateMidnightGroupCancellationError,
      );
    },
  );

  test.each([
    ["too short", "0x01"],
    ["too long", `0x${"aa".repeat(33)}`],
    ["odd length", `0x${"a".repeat(63)}`],
    ["not hex", `0x${"zz".repeat(32)}`],
    ["unprefixed", "aa".repeat(32)],
  ])("error: InvalidMidnightHexInputError when a group is %s", (_, group) => {
    let error: unknown;
    try {
      midnightCancelOffers({ ...params, groups: [groupA, group as Hex] });
    } catch (cause) {
      error = cause;
    }

    expect(error).toBeInstanceOf(InvalidMidnightHexInputError);
    expect(error).toMatchObject({ field: "groups[1]" });
  });

  test("error: MidnightZeroOnBehalfError", () => {
    expect(() =>
      midnightCancelOffers({
        ...params,
        groups: [groupA],
        onBehalf: zeroAddress,
      }),
    ).toThrow(MidnightZeroOnBehalfError);
  });

  test("error: MidnightCalldataEncodingError on a malformed onBehalf", () => {
    expect(() =>
      midnightCancelOffers({
        ...params,
        groups: [groupA],
        onBehalf: "not-an-address" as Address,
      }),
    ).toThrow(MidnightCalldataEncodingError);
  });

  test("error: UnsupportedChainIdError", () => {
    expect(() =>
      midnightCancelOffers({
        chainId: 999_999_999,
        groups: [groupA],
        onBehalf: maker,
      }),
    ).toThrow(UnsupportedChainIdError);
  });

  test("error: UnknownAddressError on a chain without Midnight", () => {
    expect(() =>
      midnightCancelOffers({
        chainId: ChainId.OptimismMainnet,
        groups: [groupA],
        onBehalf: maker,
      }),
    ).toThrow(UnknownAddressError);
  });

  propertyTest.prop(
    [
      fc.uniqueArray(
        fc
          .uint8Array({ minLength: 32, maxLength: 32 })
          .map((bytes) => `0x${Buffer.from(bytes).toString("hex")}` as Hex),
        { minLength: 1, maxLength: 8 },
      ),
      fc
        .uint8Array({ minLength: 20, maxLength: 20 })
        .map((bytes) => `0x${Buffer.from(bytes).toString("hex")}` as Address)
        .filter((address) => BigInt(address) !== 0n),
    ],
    { numRuns: 200 },
  )(
    "round trips random group lists and always cancels in full",
    (groups, onBehalf) => {
      const tx = midnightCancelOffers({
        chainId: midnightChainId,
        groups,
        onBehalf,
      });

      expect(tx.to).toBe(midnightAddresses.midnight);
      expect(tx.value).toBe(0n);
      expect(tx.data.startsWith(setConsumedSelector)).toBe(groups.length === 1);
      expect(tx.data.startsWith(multicallSelector)).toBe(groups.length > 1);
      const cancellations = decodeCancellations(tx.data);
      expect(cancellations.map(([group]) => group)).toEqual(groups);
      for (const [, amount, account] of cancellations) {
        expect(amount).toBe(maxUint128);
        expect(account.toLowerCase()).toBe(onBehalf);
      }
      expect(tx.action).toEqual({
        type: "midnightCancelOffers",
        args: { groups, onBehalf },
      });
    },
  );
});
