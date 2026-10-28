import { MarketUtils } from "@morpho-org/midnight-sdk";
import { type Address, type Hex, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightChainId,
  midnightMarket,
} from "../../test/fixtures/midnight.js";
import { InvalidMidnightHexInputError } from "../types/index.js";
import type { MidnightCancelAndMakeParams } from "../types/midnightCancelAndMake.js";
import {
  snapshotMidnightCancelAndMakeParams,
  validateMidnightBytes32,
} from "./validateMidnightPublication.js";

const groupA = `0x${"aa".repeat(32)}` as Hex;
const groupB = `0x${"bb".repeat(32)}` as Hex;

describe("snapshotMidnightCancelAndMakeParams", () => {
  test("snapshots nested data and converts the collateral market to plain params", () => {
    const market = midnightMarket;
    const params: MidnightCancelAndMakeParams = {
      chainId: midnightChainId,
      cancellations: [{ group: groupB, maxConsumed: 2n }],
      deadline: maxUint256,
      publication: {
        ratifier: "0x0000000000000000000000000000000000000001" as Address,
        root: `0x${"cc".repeat(32)}` as Hex,
        groups: [groupA],
        payload: "0x1234" as Hex,
        collateral: {
          market,
          supplies: [{ collateralIndex: 0n, assets: 3n }],
        },
      },
    };

    const snapshot = snapshotMidnightCancelAndMakeParams(params);

    expect(snapshot).not.toBe(params);
    expect(snapshot.cancellations).not.toBe(params.cancellations);
    expect(snapshot.cancellations[0]).not.toBe(params.cancellations[0]);
    expect(snapshot.publication).not.toBe(params.publication);
    expect(snapshot.publication?.groups).not.toBe(params.publication?.groups);
    expect(snapshot.publication?.collateral?.market).not.toBe(market);
    expect(snapshot.publication?.collateral?.market).toEqual(
      MarketUtils.toStruct(market),
    );
    expect(snapshot.publication?.collateral?.supplies).not.toBe(
      params.publication?.collateral?.supplies,
    );
  });
});

describe("validateMidnightBytes32", () => {
  test("default: accepts a 32-byte value", () => {
    expect(() =>
      validateMidnightBytes32("callbackSalt", `0x${"ab".repeat(32)}`),
    ).not.toThrow();
  });

  test.each([
    {
      description: "31-byte",
      value: `0x${"ab".repeat(31)}`,
      reason: "wrongSize",
    },
    {
      description: "33-byte",
      value: `0x${"ab".repeat(33)}`,
      reason: "wrongSize",
    },
    {
      description: "63-digit",
      value: `0x${"a".repeat(63)}`,
      reason: "oddLength",
    },
    { description: "non-hex", value: `0x${"zz".repeat(32)}`, reason: "notHex" },
  ] as const)("error: rejects a $description value", ({ value, reason }) => {
    let error: unknown;
    try {
      validateMidnightBytes32("callbackSalt", value as Hex);
    } catch (cause) {
      error = cause;
    }

    expect(error).toBeInstanceOf(InvalidMidnightHexInputError);
    expect(error).toMatchObject({ field: "callbackSalt", value, reason });
  });
});
