import {
  MarketUtils,
  midnightBundlesV2Abi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { decodeFunctionData, getAddress, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightApiTake,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
} from "../../../test/fixtures/midnight.js";
import {
  EmptyMidnightTakeableOffersError,
  MidnightOfferSideMismatchError,
  NonPositiveInputError,
} from "../../types/index.js";
import { midnightTakeRepayWithdrawCollateral } from "./takeRepayWithdrawCollateral.js";

const midnightBundlesV2 = getAddress(
  "0x00000000000000000000000000000000000b2002",
);
const borrower = getAddress("0x00000000000000000000000000000000000b0b00");
registerCustomAddresses({
  addresses: { [midnightChainId]: { midnightBundlesV2 } },
});

const params = {
  chainId: midnightChainId,
  market: midnightMarket,
  target: { type: "units", units: 1_000n, maxBuyerAssets: 990n },
  takeableOffers: [midnightApiTake()],
  repayEnabled: true,
  collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
  collateralReceiver: borrower,
  maxContinuousFee: 7n,
  deadline: maxUint256,
} as const;

describe("midnightTakeRepayWithdrawCollateral", () => {
  test("default", () => {
    const tx = midnightTakeRepayWithdrawCollateral(params);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightBundlesV2);
    expect(tx.value).toBe(0n);
    expect(Object.isFrozen(tx)).toBe(true);
    expect(tx.action).toEqual({
      type: "midnightTakeRepayWithdrawCollateral",
      args: {
        market: midnightMarketId,
        target: { type: "units", units: 1_000n, maxBuyerAssets: 990n },
        repayEnabled: true,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
        collateralReceiver: borrower,
        takeableOffers: 1,
        maxContinuousFee: 7n,
        deadline: maxUint256,
      },
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
    );
    expect(decoded.args).toEqual([
      MarketUtils.toStruct(midnightMarket),
      1_000n,
      990n,
      true,
      true,
      [expect.objectContaining({ units: 100n, ratifierData: "0x1234" })],
      [{ collateralIndex: 0n, assets: maxUint256 }],
      borrower,
      0n,
      expect.any(String),
      7n,
      maxUint256,
      expect.any(String),
    ]);
  });

  test("behavior: assets target without fallback or withdrawals", () => {
    const tx = midnightTakeRepayWithdrawCollateral({
      ...params,
      target: { type: "assets", assets: 500n, minUnits: 450n },
      repayEnabled: false,
      collateralWithdrawals: [],
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(decoded.functionName).toBe(
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
    );
    expect(decoded.args.slice(1, 7)).toEqual([
      500n,
      450n,
      true,
      false,
      [expect.objectContaining({ units: 100n })],
      [],
    ]);
  });

  test("behavior: appends metadata", () => {
    const tx = midnightTakeRepayWithdrawCollateral({
      ...params,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
    expect(
      decodeFunctionData({ abi: midnightBundlesV2Abi, data: tx.data })
        .functionName,
    ).toBe("midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral");
  });

  test("error: zero assets target", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "assets", assets: 0n, minUnits: 0n },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: zero units target", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "units", units: 0n, maxBuyerAssets: 1n },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: zero withdrawal amount", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 0n }],
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: unknown collateral index", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [{ collateralIndex: 9n, assets: 1n }],
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("error: no offers", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({ ...params, takeableOffers: [] }),
    ).toThrow(EmptyMidnightTakeableOffersError);
  });

  test("error: lend-side offer", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        takeableOffers: [midnightApiTake({ buy: true })],
      }),
    ).toThrow(MidnightOfferSideMismatchError);
  });
});
