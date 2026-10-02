import {
  InvalidTreeError,
  MarketParams,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import {
  getChainAddress,
  registerCustomAddresses,
} from "@morpho-org/morpho-ts";
import {
  decodeFunctionData,
  getAddress,
  type Hex,
  maxUint128,
  maxUint256,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightChainId,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import {
  DuplicateMidnightGroupCancellationError,
  InputExceedsMaxError,
  MidnightReplacementGroupCancelledError,
  NegativeInputError,
  NonPositiveInputError,
  UnknownMidnightRatifierError,
} from "../../types/index.js";
import { midnightCancelAndMake } from "./cancelAndMake.js";

const midnightBundlesV2 = getAddress(
  "0x00000000000000000000000000000000000b2002",
);
registerCustomAddresses({
  addresses: { [midnightChainId]: { midnightBundlesV2 } },
});

const rateRatifierV1 = getChainAddress(midnightChainId, "rateRatifierV1");
const priceRatifierV1 = getChainAddress(midnightChainId, "priceRatifierV1");
const root = `0x${"cd".repeat(32)}` as Hex;
const groupA = `0x${"11".repeat(32)}` as Hex;
const groupB = `0x${"22".repeat(32)}` as Hex;
const market = new MarketParams(midnightMarket);

const params = {
  chainId: midnightChainId,
  ratifier: rateRatifierV1,
  root,
  groups: [groupA],
  payload: "0x1234" as Hex,
  cancellations: [{ group: groupB, maxConsumed: 5n }],
  deadline: maxUint256,
};

describe("midnightCancelAndMake", () => {
  test("default", () => {
    const tx = midnightCancelAndMake(params);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightBundlesV2);
    expect(tx.value).toBe(0n);
    expect(decoded.functionName).toBe("midnightBundlesV2CancelAndMake");
    expect(decoded.args.slice(1, 3)).toEqual([0n, zeroHash]);
    expect(decoded.args.slice(4)).toEqual([
      [],
      rateRatifierV1,
      root,
      0n,
      0n,
      0n,
      0,
      zeroHash,
      zeroHash,
      [{ group: groupB, maxConsumed: 5n }],
      "0x1234",
      maxUint256,
      zeroAddress,
    ]);
    expect(tx.action).toEqual({
      type: "midnightCancelAndMake",
      args: {
        ratifier: rateRatifierV1,
        root,
        groups: [groupA],
        cancellations: [{ group: groupB, maxConsumed: 5n }],
        collateralSupplies: [],
        deadline: maxUint256,
      },
    });
    expect(Object.isFrozen(tx.action.args.groups)).toBe(true);
  });

  test("behavior: accepts PriceRatifierV1 and an explicit root signature", () => {
    const rootSignature = {
      height: 3n,
      nonce: 7n,
      deadline: 1_900_000_000n,
      v: 27,
      r: `0x${"aa".repeat(32)}` as Hex,
      s: `0x${"bb".repeat(32)}` as Hex,
    };
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: midnightCancelAndMake({
        ...params,
        ratifier: priceRatifierV1,
        rootSignature,
      }).data,
    });

    expect(decoded.args.slice(5, 13)).toEqual([
      priceRatifierV1,
      root,
      3n,
      7n,
      1_900_000_000n,
      27,
      rootSignature.r,
      rootSignature.s,
    ]);
  });

  test("behavior: encodes collateral supplies against the market", () => {
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: midnightCancelAndMake({
        ...params,
        collateral: {
          market,
          supplies: [{ collateralIndex: 0n, assets: 10n }],
        },
      }).data,
    });

    expect(decoded.args[3]).toEqual(MarketUtils.toStruct(market));
    expect(decoded.args[4]).toEqual([{ collateralIndex: 0n, assets: 10n }]);
  });

  test("error: UnknownMidnightRatifierError", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        ratifier: getChainAddress(midnightChainId, "setterRatifier"),
      }),
    ).toThrow(UnknownMidnightRatifierError);
  });

  test("error: InvalidTreeError on empty root, payload, or groups", () => {
    expect(() => midnightCancelAndMake({ ...params, root: zeroHash })).toThrow(
      InvalidTreeError,
    );
    expect(() => midnightCancelAndMake({ ...params, payload: "0x" })).toThrow(
      InvalidTreeError,
    );
    expect(() => midnightCancelAndMake({ ...params, groups: [] })).toThrow(
      InvalidTreeError,
    );
  });

  test("error: MidnightReplacementGroupCancelledError", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        cancellations: [
          { group: groupA.toUpperCase() as Hex, maxConsumed: 0n },
        ],
      }),
    ).toThrow(MidnightReplacementGroupCancelledError);
  });

  test("error: cancellation limits", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        cancellations: [{ group: groupB, maxConsumed: maxUint128 + 1n }],
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightCancelAndMake({
        ...params,
        cancellations: [
          { group: groupB, maxConsumed: 0n },
          { group: groupB, maxConsumed: 1n },
        ],
      }),
    ).toThrow(DuplicateMidnightGroupCancellationError);
    expect(() => midnightCancelAndMake({ ...params, deadline: -1n })).toThrow(
      NegativeInputError,
    );
  });

  test("error: NonPositiveInputError on a zero collateral supply", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        collateral: { market, supplies: [{ collateralIndex: 0n, assets: 0n }] },
      }),
    ).toThrow(NonPositiveInputError);
  });
});
