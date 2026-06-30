import { midnightBundlesAbi } from "@morpho-org/midnight-sdk";
import { decodeFunctionData } from "viem";
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
  MidnightTakeableOfferMarketMismatchError,
  MidnightTakeableOfferSideMismatchError,
} from "../../types/index.js";
import { midnightTakeBorrow } from "./takeBorrow.js";

describe("midnightTakeBorrow", () => {
  test("default", () => {
    const takeableOffers = [midnightApiTake({ buy: true })];
    const tx = midnightTakeBorrow({
      chainId: midnightChainId,
      market: midnightMarket,
      loanAssets: 1_000n,
      maxUnits: 1_100n,
      taker: midnightAddresses.taker,
      takeableOffers,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.midnightBundles);
    expect(tx.action.args.loanAssets).toBe(1_000n);
    expect(decoded.functionName).toBe(
      "supplyCollateralAndSellWithAssetsTarget",
    );
    expect(decoded.args[0]).toBe(1_000n);
    expect(decoded.args[1]).toBe(1_100n);
    expect(decoded.args?.[4]).toEqual([]);
  });

  test("error: EmptyMidnightTakeableOffersError", () => {
    expect(() =>
      midnightTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takeableOffers: [],
      }),
    ).toThrow(EmptyMidnightTakeableOffersError);
  });

  test("error: MidnightTakeableOfferSideMismatchError", () => {
    const takeableOffers = [midnightApiTake()];

    expect(() =>
      midnightTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takeableOffers,
      }),
    ).toThrow(MidnightTakeableOfferSideMismatchError);
  });

  test("error: MidnightTakeableOfferMarketMismatchError", () => {
    const takeableOffers = [
      midnightApiTake({ buy: true, market: midnightOtherMarket }),
    ];

    expect(() =>
      midnightTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takeableOffers,
      }),
    ).toThrow(MidnightTakeableOfferMarketMismatchError);
  });
});
