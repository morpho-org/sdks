import {
  MarketUtils,
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
  midnightTwoCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  EmptyMidnightTakeableOffersError,
  InputExceedsMaxError,
  MidnightContractReceiverError,
  MidnightOfferSideMismatchError,
  MidnightReferralFeePctExceededError,
  MidnightTakeableOfferMarketMismatchError,
  MidnightZeroReceiverError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
  UnboundedMidnightTakeInputError,
} from "../../types/index.js";
import { midnightTakeRepayWithdrawCollateral } from "./takeRepayWithdrawCollateral.js";

const midnightBundlesV2 = getChainAddress(midnightChainId, "midnightBundlesV2");
const wNative = getChainAddress(midnightChainId, "wNative");
const wNativeLoanMarket = { ...midnightMarket, loanToken: wNative };
const borrower = getAddress("0x00000000000000000000000000000000000B0b00");

const params = {
  chainId: midnightChainId,
  market: midnightMarket,
  target: { type: "units", units: 1_000n, maxBuyerAssets: 990n },
  takeableOffers: [midnightApiTake()],
  repayEnabled: true,
  collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
  collateralReceiver: borrower,
  maxContinuousFee: 7n,
  deadline: 600n,
} as const;

describe("midnightTakeRepayWithdrawCollateral", () => {
  test("error: MidnightZeroReceiverError", () => {
    const build = () =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        collateralReceiver: zeroAddress,
      });

    expect(build).toThrow(MidnightZeroReceiverError);
    expect(build).toThrow(
      expect.objectContaining({ field: "collateralReceiver" }),
    );
  });

  test("behavior: accepts zero collateralReceiver without withdrawals", () => {
    const tx = midnightTakeRepayWithdrawCollateral({
      ...params,
      collateralWithdrawals: [],
      collateralReceiver: zeroAddress,
    });

    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });
    expect(decoded.args[7]).toBe(zeroAddress);
  });

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
        deadline: 600n,
        referralFeePct: 0n,
        referralFeeRecipient: zeroAddress,
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
      zeroAddress,
      7n,
      600n,
      zeroAddress,
    ]);
  });

  test("behavior: wraps native ETH for the wNative loan-token pull", () => {
    const market = wNativeLoanMarket;
    const nativeAmount = 500n;
    const tx = midnightTakeRepayWithdrawCollateral({
      ...params,
      market,
      nativeAmount,
      takeableOffers: [midnightApiTake({ market })],
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.value).toBe(nativeAmount);
    expect(decoded.args.at(-1)).toBe(wNative);
  });

  test("error: native funding exceeds the units-target maxBuyerAssets pull", () => {
    const market = wNativeLoanMarket;
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        market,
        nativeAmount: 991n,
        takeableOffers: [midnightApiTake({ market })],
      }),
    ).toThrow(
      new InputExceedsMaxError({
        field: "nativeAmount",
        value: 991n,
        max: 990n,
      }),
    );
  });

  test("behavior: funds the full units-target maxBuyerAssets pull natively", () => {
    const market = wNativeLoanMarket;
    const tx = midnightTakeRepayWithdrawCollateral({
      ...params,
      market,
      nativeAmount: 990n,
      takeableOffers: [midnightApiTake({ market })],
    });

    expect(tx.value).toBe(990n);
  });

  test("error: native funding exceeds the assets-target pull", () => {
    const market = wNativeLoanMarket;
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        market,
        target: { type: "assets", assets: 500n, minUnits: 450n },
        nativeAmount: 501n,
        takeableOffers: [midnightApiTake({ market })],
      }),
    ).toThrow(
      new InputExceedsMaxError({
        field: "nativeAmount",
        value: 501n,
        max: 500n,
      }),
    );
  });

  test("error: NativeAmountOnNonWNativeAssetError", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({ ...params, nativeAmount: 1n }),
    ).toThrow(NativeAmountOnNonWNativeAssetError);
  });

  test("behavior: encodes the referral fee", () => {
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: midnightTakeRepayWithdrawCollateral({
        ...params,
        referralFeePct: 10n ** 16n,
        referralFeeRecipient: midnightAddresses.maker,
      }).data,
    });

    expect(decoded.args.slice(8, 10)).toEqual([
      10n ** 16n,
      midnightAddresses.maker,
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

  test("behavior: encodes collateral withdrawal at index 1", () => {
    const tx = midnightTakeRepayWithdrawCollateral({
      ...params,
      market: midnightTwoCollateralMarket,
      takeableOffers: [
        midnightApiTake({ market: midnightTwoCollateralMarket }),
      ],
      collateralWithdrawals: [{ collateralIndex: 1n, assets: 2_000n }],
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(decoded.args[6]).toEqual([{ collateralIndex: 1n, assets: 2_000n }]);
  });

  test("behavior: units max sentinel uses a finite pull cap", () => {
    const tx = midnightTakeRepayWithdrawCollateral({
      ...params,
      target: {
        type: "units",
        units: maxUint256,
        maxBuyerAssets: 990n,
      },
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(decoded.args.slice(1, 3)).toEqual([maxUint256, 990n]);
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
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "assets", assets: 500n, minUnits: 0n },
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

  test("error: zero assets target", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "assets", assets: 0n, minUnits: 1n },
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

  test("error: NonPositiveInputError", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "units", units: 0n, maxBuyerAssets: 1n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "units", units: 1n, maxBuyerAssets: 0n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "units", units: 1n, maxBuyerAssets: -1n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightTakeRepayWithdrawCollateral({ ...params, deadline: 0n }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: UnboundedMidnightTakeInputError deadline", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        deadline: maxUint256,
      }),
    ).toThrow(UnboundedMidnightTakeInputError);
  });

  test("error: InputExceedsMaxError", () => {
    // There is no "whole debt" sentinel for an assets target; the pull stays finite.
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "assets", assets: maxUint256, minUnits: 1n },
      }),
    ).toThrow(
      new InputExceedsMaxError({
        field: "target.assets",
        value: maxUint256,
        max: maxUint128,
      }),
    );
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "assets", assets: maxUint256 + 1n, minUnits: 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: {
          type: "assets",
          assets: 1_000n,
          minUnits: maxUint256 + 1n,
        },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "units", units: maxUint256 + 1n, maxBuyerAssets: 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: {
          type: "units",
          units: 1n,
          maxBuyerAssets: maxUint256 + 1n,
        },
      }),
    ).toThrow(InputExceedsMaxError);
    // `units: maxUint256` selects the whole debt and requires a finite pull cap.
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: {
          type: "units",
          units: maxUint256,
          maxBuyerAssets: maxUint256,
        },
      }),
    ).toThrow(
      new InputExceedsMaxError({
        field: "target.maxBuyerAssets",
        value: maxUint256,
        max: maxUint128,
      }),
    );
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        maxContinuousFee: maxUint256 + 1n,
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: maxUint256 + 1n },
        ],
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        deadline: maxUint256 + 1n,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: NegativeInputError", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "assets", assets: 1_000n, minUnits: -1n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightTakeRepayWithdrawCollateral({ ...params, maxContinuousFee: -1n }),
    ).toThrow(NegativeInputError);
    expect(() =>
      midnightTakeRepayWithdrawCollateral({ ...params, referralFeePct: -1n }),
    ).toThrow(NegativeInputError);
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        market: { ...midnightMarket, chainId: BigInt(midnightChainId + 1) },
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("error: MidnightTakeableOfferMarketMismatchError", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        takeableOffers: [midnightApiTake({ market: midnightOtherMarket })],
      }),
    ).toThrow(MidnightTakeableOfferMarketMismatchError);
  });

  test("error: ReferralFeePctExceededError", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        referralFeePct: 10n ** 18n,
      }),
    ).toThrow(ReferralFeePctExceededError);
  });

  test("error: ReferralFeeRecipientMissingError", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({ ...params, referralFeePct: 1n }),
    ).toThrow(ReferralFeeRecipientMissingError);
  });

  test("error: MidnightContractReceiverError for protocol collateral receivers", () => {
    for (const collateralReceiver of [
      midnightAddresses.midnight,
      midnightBundlesV2,
    ]) {
      const call = () =>
        midnightTakeRepayWithdrawCollateral({ ...params, collateralReceiver });

      expect(call).toThrow(MidnightContractReceiverError);
      expect(call).toThrow(
        expect.objectContaining({
          field: "collateralReceiver",
          receiver: collateralReceiver,
        }),
      );
    }
  });

  test("behavior: a contract collateralReceiver builds with no withdrawals", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [],
        collateralReceiver: midnightBundlesV2,
      }),
    ).not.toThrow();
  });

  test("error: MidnightContractReceiverError for a contract referralFeeRecipient", () => {
    const call = () =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        referralFeePct: 10n ** 16n,
        referralFeeRecipient: midnightBundlesV2,
      });

    expect(call).toThrow(MidnightContractReceiverError);
    expect(call).toThrow(
      expect.objectContaining({
        field: "referralFeeRecipient",
        receiver: midnightBundlesV2,
      }),
    );
  });

  test("error: uint128 target, withdrawal, and offer bounds", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        target: { type: "units", units: maxUint128 + 1n, maxBuyerAssets: 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: maxUint128 + 1n },
        ],
      }),
    ).toThrow(InputExceedsMaxError);
    const offer = midnightApiTake();
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        takeableOffers: [
          { ...offer, offer: { ...offer.offer, maxAssets: maxUint128 + 1n } },
        ],
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: Midnight referral fee cap", () => {
    expect(() =>
      midnightTakeRepayWithdrawCollateral({
        ...params,
        referralFeePct: 10n ** 17n + 1n,
        referralFeeRecipient: midnightAddresses.maker,
      }),
    ).toThrow(MidnightReferralFeePctExceededError);
  });
});
