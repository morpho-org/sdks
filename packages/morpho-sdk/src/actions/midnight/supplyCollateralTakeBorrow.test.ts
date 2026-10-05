import {
  midnightBundlesV2Abi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { decodeFunctionData, getAddress, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  EmptyMidnightCollateralSuppliesError,
  EmptyMidnightTakeableOffersError,
  NonPositiveInputError,
} from "../../types/index.js";
import { midnightSupplyCollateralTakeBorrow } from "./supplyCollateralTakeBorrow.js";

const midnightBundlesV2 = getAddress(
  "0x00000000000000000000000000000000000b2002",
);
registerCustomAddresses({
  addresses: { [midnightChainId]: { midnightBundlesV2 } },
});

const params = {
  chainId: midnightChainId,
  market: midnightMarket,
  target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
  receiver: midnightAddresses.taker,
  collateralSupplies: [{ collateralIndex: 0n, assets: 2_000n }],
  takeableOffers: [midnightApiTake({ buy: true })],
  deadline: maxUint256,
} as const;

describe("midnightSupplyCollateralTakeBorrow", () => {
  test("default", () => {
    const tx = midnightSupplyCollateralTakeBorrow(params);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightBundlesV2);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
      receiver: midnightAddresses.taker,
      collateralSupplies: [{ collateralIndex: 0n, assets: 2_000n }],
      takeableOffers: 1,
      deadline: maxUint256,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
    );
    expect(decoded.args[3]).toBe(false);
    expect(decoded.args[5]).toEqual([{ collateralIndex: 0n, assets: 2_000n }]);
  });

  test("behavior: appends metadata", () => {
    const tx = midnightSupplyCollateralTakeBorrow({
      ...params,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: EmptyMidnightCollateralSuppliesError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({ ...params, collateralSupplies: [] }),
    ).toThrow(EmptyMidnightCollateralSuppliesError);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        collateralSupplies: [{ collateralIndex: 0n, assets: 0n }],
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: { type: "assets", assets: 1_000n, maxUnits: 0n },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: UnknownCollateralIndexError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        collateralSupplies: [{ collateralIndex: 1n, assets: 2_000n }],
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("error: EmptyMidnightTakeableOffersError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({ ...params, takeableOffers: [] }),
    ).toThrow(EmptyMidnightTakeableOffersError);
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        market: { ...midnightMarket, chainId: BigInt(midnightChainId + 1) },
      }),
    ).toThrow(ChainIdMismatchError);
  });
});
