import {
  midnightBundlesV2Abi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  decodeFunctionData,
  getAddress,
  maxUint128,
  maxUint256,
  zeroAddress,
} from "viem";
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
  MidnightContractReceiverError,
  MidnightOfferSideMismatchError,
  MidnightReferralFeePctExceededError,
  MidnightTakeableOfferMarketMismatchError,
  MidnightTakeTargetUnreachableError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
} from "../../types/index.js";
import { midnightSupplyCollateralTakeBorrow } from "./supplyCollateralTakeBorrow.js";

const midnightBundlesV2 = getChainAddress(midnightChainId, "midnightBundlesV2");
const wNative = getChainAddress(midnightChainId, "wNative");
const wNativeCollateralMarket = {
  ...midnightMarket,
  collateralParams: midnightMarket.collateralParams.map((collateral) => ({
    ...collateral,
    token: wNative,
  })),
};

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
    const market = wNativeCollateralMarket;
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

  test("error: native funding exceeds the summed wNative collateral pull", () => {
    const market = wNativeCollateralMarket;
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        market,
        collateralSupplies: [
          { collateralIndex: 0n, assets: 2_000n },
          { collateralIndex: 0n, assets: 3_000n },
        ],
        nativeAmount: 5_001n,
        takeableOffers: [midnightApiTake({ market, buy: true })],
      }),
    ).toThrow(
      new InputExceedsMaxError({
        field: "nativeAmount",
        value: 5_001n,
        max: 5_000n,
      }),
    );
  });

  test("behavior: funds the summed wNative collateral pull natively", () => {
    const market = wNativeCollateralMarket;
    const tx = midnightSupplyCollateralTakeBorrow({
      ...params,
      market,
      collateralSupplies: [
        { collateralIndex: 0n, assets: 2_000n },
        { collateralIndex: 0n, assets: 3_000n },
      ],
      nativeAmount: 5_000n,
      takeableOffers: [midnightApiTake({ market, buy: true })],
    });

    expect(tx.value).toBe(5_000n);
  });

  test("error: native funding sums only wNative collateral pulls", () => {
    const market = {
      ...midnightMarket,
      collateralParams: [
        { ...midnightMarket.collateralParams[0]! },
        { ...midnightMarket.collateralParams[0]!, token: wNative },
      ],
    };
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        market,
        collateralSupplies: [
          { collateralIndex: 0n, assets: 2_000n },
          { collateralIndex: 1n, assets: 3_000n },
        ],
        nativeAmount: 3_001n,
        takeableOffers: [midnightApiTake({ market, buy: true })],
      }),
    ).toThrow(
      new InputExceedsMaxError({
        field: "nativeAmount",
        value: 3_001n,
        max: 3_000n,
      }),
    );
  });

  test("error: NativeAmountOnNonWNativeAssetError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({ ...params, nativeAmount: 1n }),
    ).toThrow(NativeAmountOnNonWNativeAssetError);
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

  test("error: MidnightTakeTargetUnreachableError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: { type: "assets", assets: 1_000n, maxUnits: 999n },
      }),
    ).toThrow(MidnightTakeTargetUnreachableError);
  });

  test("error: MidnightContractReceiverError for protocol receivers", () => {
    for (const receiver of [midnightAddresses.midnight, midnightBundlesV2]) {
      const call = () =>
        midnightSupplyCollateralTakeBorrow({ ...params, receiver });

      expect(call).toThrow(MidnightContractReceiverError);
      expect(call).toThrow(
        expect.objectContaining({ field: "receiver", receiver }),
      );
    }
  });

  test("error: MidnightContractReceiverError for a contract referralFeeRecipient", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        referralFeePct: 10n ** 16n,
        referralFeeRecipient: midnightBundlesV2,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightContractReceiverError",
        field: "referralFeeRecipient",
      }),
    );
  });

  test("behavior: a contract referralFeeRecipient builds with a zero referral fee", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        referralFeeRecipient: midnightBundlesV2,
      }),
    ).not.toThrow();
  });

  test("error: collateral aggregate, target, and offer uint128 bounds", () => {
    let collateralSumError: unknown;
    try {
      midnightSupplyCollateralTakeBorrow({
        ...params,
        collateralSupplies: [
          { collateralIndex: 0n, assets: maxUint128 },
          { collateralIndex: 0n, assets: 1n },
        ],
      });
    } catch (reason) {
      collateralSumError = reason;
    }
    expect(collateralSumError).toBeInstanceOf(InputExceedsMaxError);
    expect(collateralSumError).toMatchObject({
      field: "collateralSupplies(collateralIndex=0)",
    });
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        target: { type: "assets", assets: maxUint128 + 1n, maxUnits: 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    const offer = midnightApiTake({ buy: true });
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        takeableOffers: [
          { ...offer, offer: { ...offer.offer, maxUnits: maxUint128 + 1n } },
        ],
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: MidnightReferralFeePctExceededError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        referralFeePct: 10n ** 17n + 1n,
        referralFeeRecipient: midnightAddresses.maker,
      }),
    ).toThrow(MidnightReferralFeePctExceededError);
  });

  test("error: ReferralFeePctExceededError at WAD", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        ...params,
        referralFeePct: 10n ** 18n,
      }),
    ).toThrow(ReferralFeePctExceededError);
  });
});
