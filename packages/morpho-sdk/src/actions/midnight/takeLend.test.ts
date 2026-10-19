import { MarketUtils, midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { decodeFunctionData, maxUint128, maxUint256, zeroAddress } from "viem";
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
  EmptyMidnightTakeableOffersError,
  InputExceedsMaxError,
  MidnightContractReceiverError,
  MidnightOfferSideMismatchError,
  MidnightReferralFeePctExceededError,
  MidnightTakeableOfferMarketMismatchError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
} from "../../types/index.js";
import { midnightTakeLend } from "./takeLend.js";

const midnightBundlesV2 = getChainAddress(midnightChainId, "midnightBundlesV2");
const wNative = getChainAddress(midnightChainId, "wNative");
const wNativeLoanMarket = { ...midnightMarket, loanToken: wNative };

const params = {
  chainId: midnightChainId,
  market: midnightMarket,
  target: { type: "assets", assets: 1_000n, minUnits: 900n },
  takeableOffers: [midnightApiTake()],
  maxContinuousFee: 7n,
  deadline: 2_000_000_000n,
} as const;

describe("midnightTakeLend", () => {
  test("default", () => {
    const tx = midnightTakeLend(params);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightBundlesV2);
    expect(tx.value).toBe(0n);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      target: { type: "assets", assets: 1_000n, minUnits: 900n },
      takeableOffers: 1,
      maxContinuousFee: 7n,
      deadline: params.deadline,
      referralFeePct: 0n,
      referralFeeRecipient: zeroAddress,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
    );
    expect(decoded.args).toEqual([
      MarketUtils.toStruct(midnightMarket),
      1_000n,
      900n,
      false,
      false,
      [expect.objectContaining({ units: 100n, ratifierData: "0x1234" })],
      [],
      zeroAddress,
      0n,
      zeroAddress,
      7n,
      params.deadline,
      zeroAddress,
    ]);
  });

  test("behavior: preserves takeable offer fill order", () => {
    const offers = [
      midnightApiTake({
        maker: midnightAddresses.maker,
        tick: 5_003n,
      }),
      midnightApiTake({
        maker: midnightAddresses.taker,
        tick: 5_001n,
      }),
      midnightApiTake({
        maker: midnightAddresses.loanToken,
        tick: 5_002n,
      }),
    ];
    const expectedFills = offers.map(({ offer, units, ratifierData }) => ({
      offer,
      units,
      ratifierData,
    }));
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: midnightTakeLend({ ...params, takeableOffers: offers }).data,
    });

    expect(decoded.args[5]).toEqual(expectedFills);
  });

  test("behavior: wraps native ETH for the wNative loan-token pull", () => {
    const market = wNativeLoanMarket;
    const nativeAmount = 500n;
    const tx = midnightTakeLend({
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

  test("error: native funding exceeds the assets-target pull", () => {
    const market = wNativeLoanMarket;
    expect(() =>
      midnightTakeLend({
        ...params,
        market,
        nativeAmount: 1_001n,
        takeableOffers: [midnightApiTake({ market })],
      }),
    ).toThrow(
      new InputExceedsMaxError({
        field: "nativeAmount",
        value: 1_001n,
        max: 1_000n,
      }),
    );
  });

  test("error: native funding exceeds the units-target maxBuyerAssets pull", () => {
    const market = wNativeLoanMarket;
    expect(() =>
      midnightTakeLend({
        ...params,
        market,
        target: { type: "units", units: 500n, maxBuyerAssets: 450n },
        nativeAmount: 451n,
        takeableOffers: [midnightApiTake({ market })],
      }),
    ).toThrow(
      new InputExceedsMaxError({
        field: "nativeAmount",
        value: 451n,
        max: 450n,
      }),
    );
  });

  test("behavior: funds the full units-target maxBuyerAssets pull natively", () => {
    const market = wNativeLoanMarket;
    const tx = midnightTakeLend({
      ...params,
      market,
      target: { type: "units", units: 500n, maxBuyerAssets: 450n },
      nativeAmount: 450n,
      takeableOffers: [midnightApiTake({ market })],
    });

    expect(tx.value).toBe(450n);
  });

  test("error: NativeAmountOnNonWNativeAssetError", () => {
    expect(() => midnightTakeLend({ ...params, nativeAmount: 1n })).toThrow(
      NativeAmountOnNonWNativeAssetError,
    );
  });

  test("behavior: units target selects the units-target entrypoint", () => {
    const tx = midnightTakeLend({
      ...params,
      target: { type: "units", units: 500n, maxBuyerAssets: 450n },
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(decoded.functionName).toBe(
      "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
    );
    expect(decoded.args.slice(1, 3)).toEqual([500n, 450n]);
  });

  test("behavior: encodes the referral fee", () => {
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: midnightTakeLend({
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

  test("behavior: appends metadata", () => {
    const tx = midnightTakeLend({
      ...params,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightTakeLend({
        ...params,
        market: { ...midnightMarket, chainId: BigInt(midnightChainId + 1) },
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      midnightTakeLend({
        ...params,
        target: { type: "assets", assets: 0n, minUnits: 900n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightTakeLend({
        ...params,
        target: { type: "units", units: 0n, maxBuyerAssets: 1n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightTakeLend({
        ...params,
        target: { type: "units", units: 1n, maxBuyerAssets: 0n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() => midnightTakeLend({ ...params, deadline: 0n })).toThrow(
      NonPositiveInputError,
    );
  });

  test("error: NonPositiveInputError for a zero minimum unit bound", () => {
    expect(() =>
      midnightTakeLend({
        ...params,
        target: { type: "assets", assets: 1_000n, minUnits: 0n },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: UnboundedMidnightTakeInputError", () => {
    expect(() =>
      midnightTakeLend({
        ...params,
        target: {
          type: "units",
          units: maxUint256,
          maxBuyerAssets: 1_000n,
        },
      }),
    ).toThrow(
      expect.objectContaining({
        name: "UnboundedMidnightTakeInputError",
        field: "target.units",
      }),
    );
    expect(() =>
      midnightTakeLend({
        ...params,
        target: {
          type: "units",
          units: 1_000n,
          maxBuyerAssets: maxUint256,
        },
      }),
    ).toThrow(
      expect.objectContaining({
        name: "UnboundedMidnightTakeInputError",
        field: "target.maxBuyerAssets",
      }),
    );
    expect(() => midnightTakeLend({ ...params, deadline: maxUint256 })).toThrow(
      expect.objectContaining({
        name: "UnboundedMidnightTakeInputError",
        field: "deadline",
      }),
    );
  });

  test("error: InputExceedsMaxError", () => {
    expect(() =>
      midnightTakeLend({
        ...params,
        target: { type: "assets", assets: maxUint256 + 1n, minUnits: 900n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeLend({
        ...params,
        target: { type: "assets", assets: 1_000n, minUnits: maxUint256 + 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeLend({ ...params, maxContinuousFee: maxUint256 + 1n }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeLend({
        ...params,
        target: {
          type: "units",
          units: maxUint256 + 1n,
          maxBuyerAssets: 1_000n,
        },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeLend({
        ...params,
        target: {
          type: "units",
          units: 1_000n,
          maxBuyerAssets: maxUint256 + 1n,
        },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeLend({ ...params, deadline: maxUint256 + 1n }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: NegativeInputError", () => {
    expect(() =>
      midnightTakeLend({ ...params, maxContinuousFee: -1n }),
    ).toThrow(NegativeInputError);
  });

  test("error: ReferralFeeRecipientMissingError", () => {
    expect(() => midnightTakeLend({ ...params, referralFeePct: 1n })).toThrow(
      ReferralFeeRecipientMissingError,
    );
  });

  test("error: EmptyMidnightTakeableOffersError", () => {
    expect(() => midnightTakeLend({ ...params, takeableOffers: [] })).toThrow(
      EmptyMidnightTakeableOffersError,
    );
  });

  test("error: MidnightOfferSideMismatchError", () => {
    const build = () =>
      midnightTakeLend({
        ...params,
        takeableOffers: [
          midnightApiTake(),
          midnightApiTake({ tick: 5_001n }),
          midnightApiTake({ buy: true, tick: 5_002n }),
        ],
      });

    expect(build).toThrow(MidnightOfferSideMismatchError);
    expect(build).toThrow(/offer "2"/);
  });

  test("error: MidnightTakeableOfferMarketMismatchError", () => {
    const build = () =>
      midnightTakeLend({
        ...params,
        takeableOffers: [
          midnightApiTake(),
          midnightApiTake({ tick: 5_001n }),
          midnightApiTake({ market: midnightOtherMarket, tick: 5_002n }),
        ],
      });

    expect(build).toThrow(MidnightTakeableOfferMarketMismatchError);
    expect(build).toThrow(/offer "2"/);
  });

  test("error: MidnightContractReceiverError for a contract referralFeeRecipient", () => {
    const call = () =>
      midnightTakeLend({
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

  test("behavior: a contract referralFeeRecipient builds with a zero referral fee", () => {
    expect(() =>
      midnightTakeLend({
        ...params,
        referralFeeRecipient: midnightBundlesV2,
      }),
    ).not.toThrow();
  });

  test("error: uint128 target and offer bounds", () => {
    expect(() =>
      midnightTakeLend({
        ...params,
        target: { type: "assets", assets: maxUint128 + 1n, minUnits: 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    const offer = midnightApiTake();
    expect(() =>
      midnightTakeLend({
        ...params,
        takeableOffers: [
          { ...offer, offer: { ...offer.offer, maxUnits: maxUint128 + 1n } },
        ],
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: MidnightReferralFeePctExceededError", () => {
    expect(() =>
      midnightTakeLend({
        ...params,
        referralFeePct: 10n ** 17n + 1n,
        referralFeeRecipient: midnightAddresses.maker,
      }),
    ).toThrow(MidnightReferralFeePctExceededError);
  });

  test("error: ReferralFeePctExceededError at WAD", () => {
    expect(() =>
      midnightTakeLend({ ...params, referralFeePct: 10n ** 18n }),
    ).toThrow(ReferralFeePctExceededError);
  });
});
