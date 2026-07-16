import { midnightBundlesAbi } from "@morpho-org/midnight-sdk";
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
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
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
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.midnightBundles);
    expect(tx.action.args.loanAssets).toBe(1_000n);
    expect(decoded.functionName).toBe(
      "midnightBundlesV1SupplyCollateralAndSellWithAssetsTarget",
    );
    expect(decoded.args[0]).toBe(1_000n);
    expect(decoded.args[1]).toBe(1_100n);
    expect(decoded.args?.[5]).toEqual([]);
  });

  test("behavior: appends metadata", () => {
    const tx = midnightTakeBorrow({
      chainId: midnightChainId,
      market: midnightMarket,
      loanAssets: 1_000n,
      maxUnits: 1_100n,
      taker: midnightAddresses.taker,
      takeableOffers: [midnightApiTake({ buy: true })],
      deadline: maxUint256,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: NonPositiveMidnightAmountError", () => {
    expect(() =>
      midnightTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        loanAssets: 0n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takeableOffers: [midnightApiTake({ buy: true })],
        deadline: maxUint256,
      }),
    ).toThrow(NonPositiveMidnightAmountError);
  });

  test("error: amount validation", () => {
    const params = {
      chainId: midnightChainId,
      market: midnightMarket,
      loanAssets: 1_000n,
      maxUnits: 1_100n,
      taker: midnightAddresses.taker,
      takeableOffers: [midnightApiTake({ buy: true })],
      deadline: maxUint256,
    } as const;

    expect(() => midnightTakeBorrow({ ...params, maxUnits: 0n })).toThrow(
      NonPositiveMidnightAmountError,
    );
    expect(() => midnightTakeBorrow({ ...params, maxUnits: -1n })).toThrow(
      NonPositiveMidnightAmountError,
    );
    expect(() => midnightTakeBorrow({ ...params, deadline: -1n })).toThrow(
      NegativeMidnightAmountError,
    );
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
        deadline: maxUint256,
      }),
    ).toThrow(EmptyMidnightTakeableOffersError);
  });

  test("error: MidnightOfferSideMismatchError", () => {
    const takeableOffers = [midnightApiTake()];

    expect(() =>
      midnightTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
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
      midnightTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takeableOffers,
        deadline: maxUint256,
      }),
    ).toThrow(MidnightTakeableOfferMarketMismatchError);
  });
});
