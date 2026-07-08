import {
  midnightBundlesAbi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { decodeFunctionData, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightChainId,
  midnightMarket,
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import {
  EmptyMidnightTakeableOffersError,
  MidnightOfferSideMismatchError,
  MidnightTakeableOfferMarketMismatchError,
} from "../../types/index.js";
import { midnightSupplyCollateralTakeBorrow } from "./supplyCollateralTakeBorrow.js";

describe("midnightSupplyCollateralTakeBorrow", () => {
  test("default", () => {
    const takeableOffers = [midnightApiTake({ buy: true })];
    const tx = midnightSupplyCollateralTakeBorrow({
      chainId: midnightChainId,
      market: midnightMarket,
      collateralAssets: 2_000n,
      loanAssets: 1_000n,
      maxUnits: 1_100n,
      taker: midnightAddresses.taker,
      takeableOffers,
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.midnightBundles);
    expect(tx.action.args.loanAssets).toBe(1_000n);
    expect(tx.action.type).toBe("midnightSupplyCollateralTakeBorrow");
    expect(decoded.functionName).toBe(
      "midnightBundlesV1SupplyCollateralAndSellWithAssetsTarget",
    );
    expect(decoded.args[0]).toBe(1_000n);
    expect(decoded.args[1]).toBe(1_100n);
    expect(decoded.args?.[5]).toMatchObject([
      {
        permit: {
          kind: 0,
          data: "0x",
        },
      },
    ]);
    expect(decoded.args?.[3]).toBe(false);
    expect(decoded.args?.[7]).toBe(0n);
    expect(decoded.args?.[9]).toBe(maxUint256);
  });

  test("error: EmptyMidnightTakeableOffersError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takeableOffers: [],
        deadline: maxUint256,
      }),
    ).toThrow(EmptyMidnightTakeableOffersError);
  });

  test("error: MidnightOfferSideMismatchError", () => {
    const takeableOffers = [midnightApiTake()];

    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takeableOffers,
        deadline: maxUint256,
      }),
    ).toThrow(MidnightOfferSideMismatchError);
  });

  test("error: MidnightTakeableOfferMarketMismatchError", () => {
    const takeableOffers = [
      midnightApiTake({ buy: true, market: midnightOtherMarket }),
    ];

    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takeableOffers,
        deadline: maxUint256,
      }),
    ).toThrow(MidnightTakeableOfferMarketMismatchError);
  });

  test("error: UnknownCollateralIndexError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        collateralIndex: 1n,
        takeableOffers: [midnightApiTake({ buy: true })],
        deadline: maxUint256,
      }),
    ).toThrow(UnknownCollateralIndexError);
  });
});
