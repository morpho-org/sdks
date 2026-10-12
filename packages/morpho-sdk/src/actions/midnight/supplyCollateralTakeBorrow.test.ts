import {
  midnightBundlesV2Abi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { decodeFunctionData, getAddress, maxUint256, zeroAddress } from "viem";
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
  ChainIdMismatchError,
  EmptyMidnightCollateralSuppliesError,
  EmptyMidnightTakeableOffersError,
  InputExceedsMaxError,
  MidnightOfferSideMismatchError,
  MidnightTakeableOfferMarketMismatchError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeeRecipientMissingError,
} from "../../types/index.js";
import { midnightSupplyCollateralTakeBorrow } from "./supplyCollateralTakeBorrow.js";

const midnightBundlesV2 = getChainAddress(midnightChainId, "midnightBundlesV2");
const wNative = getChainAddress(midnightChainId, "wNative");

const params = {
  chainId: midnightChainId,
  market: midnightMarket,
  target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
  receiver: midnightAddresses.taker,
  collateralSupplies: [{ collateralIndex: 0n, assets: 2_000n }],
  takeableOffers: [midnightApiTake({ buy: true })],
  deadline: 2_000_000_000n,
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
      deadline: params.deadline,
      referralFeePct: 0n,
      referralFeeRecipient: zeroAddress,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
    );
    expect(tx.value).toBe(0n);
    expect(decoded.args.at(-1)).toBe(zeroAddress);
    expect(decoded.args[3]).toBe(false);
    expect(decoded.args[5]).toEqual([{ collateralIndex: 0n, assets: 2_000n }]);
  });

  test("behavior: wraps native ETH for the wNative collateral pull", () => {
    const market = {
      ...midnightMarket,
      collateralParams: midnightMarket.collateralParams.map((collateral) => ({
        ...collateral,
        token: wNative,
      })),
    };
    const nativeAmount = 500n;
    const tx = midnightSupplyCollateralTakeBorrow({
      ...params,
      market,
      nativeAmount,
      takeableOffers: [midnightApiTake({ market, buy: true })],
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.value).toBe(nativeAmount);
    expect(decoded.args.at(-1)).toBe(wNative);
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
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: { type: "assets", assets: 0n, maxUnits: 1_100n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: { type: "units", units: 0n, minSellerAssets: 1n },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NonPositiveInputError for a zero minimum seller-asset bound", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: { type: "units", units: 1_000n, minSellerAssets: 0n },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: UnboundedMidnightTakeInputError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: {
          type: "units",
          units: maxUint256,
          minSellerAssets: 1n,
        },
      }),
    ).toThrow(
      expect.objectContaining({
        name: "UnboundedMidnightTakeInputError",
        field: "target.units",
      }),
    );
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: { type: "assets", assets: 1_000n, maxUnits: maxUint256 },
      }),
    ).toThrow(
      expect.objectContaining({
        name: "UnboundedMidnightTakeInputError",
        field: "target.maxUnits",
      }),
    );
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        deadline: maxUint256,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "UnboundedMidnightTakeInputError",
        field: "deadline",
      }),
    );
  });

  test("error: MidnightZeroReceiverError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        receiver: zeroAddress,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightZeroReceiverError",
        field: "receiver",
      }),
    );
  });

  test("error: InputExceedsMaxError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: { type: "assets", assets: maxUint256 + 1n, maxUnits: 1_100n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: { type: "assets", assets: 1_000n, maxUnits: maxUint256 + 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        collateralSupplies: [{ collateralIndex: 0n, assets: maxUint256 + 1n }],
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: {
          type: "units",
          units: maxUint256 + 1n,
          minSellerAssets: 1n,
        },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: {
          type: "units",
          units: 1_000n,
          minSellerAssets: maxUint256 + 1n,
        },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        deadline: maxUint256 + 1n,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("behavior: encodes units target, receiver and referral fee", () => {
    const referralFeeRecipient = getAddress(
      "0x000000000000000000000000000000000000fEee",
    );
    const tx = midnightSupplyCollateralTakeBorrow({
      ...params,
      target: { type: "units", units: 1_000n, minSellerAssets: 900n },
      referralFeePct: 1n,
      referralFeeRecipient,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(decoded.functionName).toBe(
      "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
    );
    expect(decoded.args.slice(1, 5)).toEqual([
      1_000n,
      900n,
      false,
      midnightAddresses.taker,
    ]);
    expect(decoded.args.slice(7, 9)).toEqual([1n, referralFeeRecipient]);
    expect(tx.action.args).toMatchObject({
      referralFeePct: 1n,
      referralFeeRecipient,
    });
  });

  test("error: NegativeInputError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({ ...params, referralFeePct: -1n }),
    ).toThrow(NegativeInputError);
  });

  test("error: ReferralFeeRecipientMissingError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({ ...params, referralFeePct: 1n }),
    ).toThrow(ReferralFeeRecipientMissingError);
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

  test("error: MidnightOfferSideMismatchError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        takeableOffers: [midnightApiTake({ buy: false })],
      }),
    ).toThrow(MidnightOfferSideMismatchError);
  });

  test("error: MidnightTakeableOfferMarketMismatchError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        takeableOffers: [
          midnightApiTake({ buy: true, market: midnightOtherMarket }),
        ],
      }),
    ).toThrow(MidnightTakeableOfferMarketMismatchError);
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
