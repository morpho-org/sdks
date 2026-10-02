import {
  InvalidTreeError,
  MarketUtils,
  midnightBundlesV2Abi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import {
  decodeFunctionData,
  getAddress,
  type Hex,
  maxUint256,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightChainId,
  midnightMarket,
  midnightMarketId,
} from "../../../test/fixtures/midnight.js";
import {
  DuplicateMidnightCollateralSupplyError,
  DuplicateMidnightGroupCancellationError,
  EmptyMidnightCollateralSuppliesError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import { midnightSupplyCollateralMakeBorrow } from "./supplyCollateralMakeBorrow.js";

const midnightBundlesV2 = getAddress(
  "0x00000000000000000000000000000000000b2002",
);
registerCustomAddresses({
  addresses: { [midnightChainId]: { midnightBundlesV2 } },
});

const ratifier = getAddress("0x00000000000000000000000000000000000C0001");
const root = `0x${"aa".repeat(32)}` as Hex;
const groupA = `0x${"11".repeat(32)}` as Hex;
const groupB = `0x${"22".repeat(32)}` as Hex;
const payload = "0x0102" as Hex;
const base = {
  chainId: midnightChainId,
  market: midnightMarket,
  collateralSupplies: [{ collateralIndex: 0n, assets: 1_000n }],
  ratifier,
  root,
  groups: [groupA],
  offers: 1,
  payload,
  deadline: maxUint256,
};

describe("midnightSupplyCollateralMakeBorrow", () => {
  test("default", () => {
    const cancellations = [{ group: groupB, maxConsumed: 7n }];
    const tx = midnightSupplyCollateralMakeBorrow({ ...base, cancellations });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightBundlesV2);
    expect(tx.value).toBe(0n);
    expect(Object.isFrozen(tx)).toBe(true);
    expect(decoded.functionName).toBe("midnightBundlesV2CancelAndMake");
    expect(decoded.args).toEqual([
      {
        loanToken: zeroAddress,
        collateralToken: zeroAddress,
        oracle: zeroAddress,
        irm: zeroAddress,
        lltv: 0n,
      },
      0n,
      zeroHash,
      MarketUtils.toStruct(midnightMarket),
      [{ collateralIndex: 0n, assets: 1_000n }],
      ratifier,
      root,
      0n,
      0n,
      0n,
      0,
      zeroHash,
      zeroHash,
      cancellations,
      payload,
      maxUint256,
      zeroAddress,
    ]);
    expect(tx.action).toEqual({
      type: "midnightSupplyCollateralMakeBorrow",
      args: {
        market: midnightMarketId,
        collateralSupplies: [{ collateralIndex: 0n, assets: 1_000n }],
        ratifier,
        root,
        groups: [groupA],
        offers: 1,
        cancellations,
        deadline: maxUint256,
      },
    });
  });

  test("behavior: defaults to no cancellations", () => {
    const tx = midnightSupplyCollateralMakeBorrow(base);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(decoded.args?.[13]).toEqual([]);
    expect(tx.action.args.cancellations).toEqual([]);
  });

  test("behavior: appends metadata", () => {
    const tx = midnightSupplyCollateralMakeBorrow({
      ...base,
      metadata: { origin: "abcd1234" },
    });

    expect(tx.data.endsWith("abcd1234")).toBe(true);
  });

  test("error: collateral supply validation", () => {
    expect(() =>
      midnightSupplyCollateralMakeBorrow({ ...base, collateralSupplies: [] }),
    ).toThrow(EmptyMidnightCollateralSuppliesError);
    expect(() =>
      midnightSupplyCollateralMakeBorrow({
        ...base,
        collateralSupplies: [{ collateralIndex: 0n, assets: 0n }],
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightSupplyCollateralMakeBorrow({
        ...base,
        collateralSupplies: [{ collateralIndex: 1n, assets: 1n }],
      }),
    ).toThrow(UnknownCollateralIndexError);
    expect(() =>
      midnightSupplyCollateralMakeBorrow({
        ...base,
        collateralSupplies: [
          { collateralIndex: 0n, assets: 1n },
          { collateralIndex: 0n, assets: 2n },
        ],
      }),
    ).toThrow(DuplicateMidnightCollateralSupplyError);
  });

  test("error: payload, deadline, and cancellation validation", () => {
    expect(() =>
      midnightSupplyCollateralMakeBorrow({ ...base, offers: 0 }),
    ).toThrow(InvalidTreeError);
    expect(() =>
      midnightSupplyCollateralMakeBorrow({ ...base, deadline: -1n }),
    ).toThrow(NegativeInputError);
    expect(() =>
      midnightSupplyCollateralMakeBorrow({
        ...base,
        cancellations: [
          { group: groupB, maxConsumed: 0n },
          { group: groupB, maxConsumed: 1n },
        ],
      }),
    ).toThrow(DuplicateMidnightGroupCancellationError);
  });
});
