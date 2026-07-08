import { midnightBundlesAbi } from "@morpho-org/midnight-sdk";
import { decodeFunctionData, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import {
  EmptyMidnightTakeableOffersError,
  MidnightOfferSideMismatchError,
  MidnightTakeableOfferMarketMismatchError,
} from "../../types/index.js";
import { midnightTakeLend } from "./takeLend.js";

describe("midnightTakeLend", () => {
  test("default", () => {
    const takeableOffers = [midnightApiTake()];
    const tx = midnightTakeLend({
      chainId: midnightChainId,
      market: midnightMarket,
      assets: 1_000n,
      minUnits: 900n,
      taker: midnightAddresses.taker,
      takeableOffers,
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.midnightBundles);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      assets: 1_000n,
      minUnits: 900n,
      taker: midnightAddresses.taker,
      takeableOffers: 1,
      deadline: maxUint256,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV1BuyWithAssetsTargetAndWithdrawCollateral",
    );
    expect(decoded.args[0]).toBe(1_000n);
    expect(decoded.args[1]).toBe(900n);
    expect(decoded.args?.[4]).toEqual({
      kind: 0,
      data: "0x",
    });
    expect(decoded.args?.[6]).toEqual([]);
    expect(decoded.args?.[8]).toBe(0n);
    expect(decoded.args?.[10]).toBe(maxUint256);
  });

  test("error: EmptyMidnightTakeableOffersError", () => {
    expect(() =>
      midnightTakeLend({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1_000n,
        minUnits: 900n,
        taker: midnightAddresses.taker,
        takeableOffers: [],
        deadline: maxUint256,
      }),
    ).toThrow(EmptyMidnightTakeableOffersError);
  });

  test("error: MidnightOfferSideMismatchError", () => {
    const takeableOffers = [midnightApiTake({ buy: true })];

    expect(() =>
      midnightTakeLend({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1_000n,
        minUnits: 900n,
        taker: midnightAddresses.taker,
        takeableOffers,
        deadline: maxUint256,
      }),
    ).toThrow(MidnightOfferSideMismatchError);
  });

  test("error: MidnightTakeableOfferMarketMismatchError", () => {
    const takeableOffers = [midnightApiTake({ market: midnightOtherMarket })];

    expect(() =>
      midnightTakeLend({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1_000n,
        minUnits: 900n,
        taker: midnightAddresses.taker,
        takeableOffers,
        deadline: maxUint256,
      }),
    ).toThrow(MidnightTakeableOfferMarketMismatchError);
  });
});
