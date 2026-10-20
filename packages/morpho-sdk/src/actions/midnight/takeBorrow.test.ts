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
  MidnightTakeTargetUnreachableError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
} from "../../types/index.js";
import { midnightTakeBorrow } from "./takeBorrow.js";

const midnightBundlesV2 = getChainAddress(midnightChainId, "midnightBundlesV2");

const params = {
  chainId: midnightChainId,
  market: midnightMarket,
  target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
  receiver: midnightAddresses.taker,
  takeableOffers: [midnightApiTake({ buy: true })],
  deadline: 2_000_000_000n,
} as const;

describe("midnightTakeBorrow", () => {
  test("default", () => {
    const tx = midnightTakeBorrow(params);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightBundlesV2);
    expect(tx.value).toBe(0n);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
      receiver: midnightAddresses.taker,
      takeableOffers: 1,
      deadline: params.deadline,
      referralFeePct: 0n,
      referralFeeRecipient: zeroAddress,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
    );
    expect(decoded.args).toEqual([
      MarketUtils.toStruct(midnightMarket),
      1_000n,
      1_100n,
      false,
      midnightAddresses.taker,
      [],
      [expect.objectContaining({ units: 100n, ratifierData: "0x1234" })],
      0n,
      zeroAddress,
      params.deadline,
      zeroAddress,
    ]);
  });

  test("behavior: units target selects the units-target entrypoint", () => {
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: midnightTakeBorrow({
        ...params,
        target: { type: "units", units: 1_100n, minSellerAssets: 1n },
      }).data,
    });

    expect(decoded.functionName).toBe(
      "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
    );
    expect(decoded.args.slice(1, 3)).toEqual([1_100n, 1n]);
  });

  test("behavior: encodes the referral fee", () => {
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: midnightTakeBorrow({
        ...params,
        referralFeePct: 10n ** 16n,
        referralFeeRecipient: midnightAddresses.maker,
      }).data,
    });

    expect(decoded.args.slice(7, 9)).toEqual([
      10n ** 16n,
      midnightAddresses.maker,
    ]);
  });

  test("behavior: appends metadata", () => {
    const tx = midnightTakeBorrow({
      ...params,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightTakeBorrow({
        ...params,
        market: { ...midnightMarket, chainId: BigInt(midnightChainId + 1) },
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("error: MidnightTakeTargetUnreachableError", () => {
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: { type: "assets", assets: 1_000n, maxUnits: 999n },
      }),
    ).toThrow(MidnightTakeTargetUnreachableError);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: { type: "assets", assets: 0n, maxUnits: 1_100n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: { type: "assets", assets: 1_000n, maxUnits: 0n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: { type: "units", units: 0n, minSellerAssets: 1n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() => midnightTakeBorrow({ ...params, deadline: 0n })).toThrow(
      NonPositiveInputError,
    );
  });

  test("error: NonPositiveInputError for a zero minimum seller-asset bound", () => {
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: { type: "units", units: 1_100n, minSellerAssets: 0n },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: UnboundedMidnightTakeInputError", () => {
    expect(() =>
      midnightTakeBorrow({
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
      midnightTakeBorrow({
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
      midnightTakeBorrow({ ...params, deadline: maxUint256 }),
    ).toThrow(
      expect.objectContaining({
        name: "UnboundedMidnightTakeInputError",
        field: "deadline",
      }),
    );
  });

  test("error: NonPositiveInputError when assets target has an unbounded maxUnits", () => {
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: { type: "assets", assets: 0n, maxUnits: maxUint256 },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: MidnightZeroReceiverError", () => {
    expect(() =>
      midnightTakeBorrow({ ...params, receiver: zeroAddress }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightZeroReceiverError",
        field: "receiver",
      }),
    );
  });

  test("error: InputExceedsMaxError", () => {
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: { type: "assets", assets: maxUint256 + 1n, maxUnits: 1_100n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: { type: "assets", assets: 1_000n, maxUnits: maxUint256 + 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: {
          type: "units",
          units: maxUint256 + 1n,
          minSellerAssets: 1n,
        },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: {
          type: "units",
          units: 1_000n,
          minSellerAssets: maxUint256 + 1n,
        },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeBorrow({ ...params, deadline: maxUint256 + 1n }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: NegativeInputError", () => {
    expect(() =>
      midnightTakeBorrow({ ...params, referralFeePct: -1n }),
    ).toThrow(NegativeInputError);
  });

  test("error: ReferralFeeRecipientMissingError", () => {
    expect(() => midnightTakeBorrow({ ...params, referralFeePct: 1n })).toThrow(
      ReferralFeeRecipientMissingError,
    );
  });

  test("error: EmptyMidnightTakeableOffersError", () => {
    expect(() => midnightTakeBorrow({ ...params, takeableOffers: [] })).toThrow(
      EmptyMidnightTakeableOffersError,
    );
  });

  test("error: MidnightOfferSideMismatchError", () => {
    expect(() =>
      midnightTakeBorrow({
        ...params,
        takeableOffers: [midnightApiTake({ buy: false })],
      }),
    ).toThrow(MidnightOfferSideMismatchError);
  });

  test("error: MidnightTakeableOfferMarketMismatchError", () => {
    expect(() =>
      midnightTakeBorrow({
        ...params,
        takeableOffers: [
          midnightApiTake({ buy: true, market: midnightOtherMarket }),
        ],
      }),
    ).toThrow(MidnightTakeableOfferMarketMismatchError);
  });

  test("error: MidnightContractReceiverError for protocol receivers", () => {
    for (const receiver of [midnightAddresses.midnight, midnightBundlesV2]) {
      const call = () => midnightTakeBorrow({ ...params, receiver });

      expect(call).toThrow(MidnightContractReceiverError);
      expect(call).toThrow(
        expect.objectContaining({ field: "receiver", receiver }),
      );
    }
  });

  test("error: MidnightContractReceiverError for a contract referralFeeRecipient", () => {
    expect(() =>
      midnightTakeBorrow({
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
      midnightTakeBorrow({
        ...params,
        referralFeeRecipient: midnightBundlesV2,
      }),
    ).not.toThrow();
  });

  test("error: uint128 target and offer bounds", () => {
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: { type: "assets", assets: maxUint128 + 1n, maxUnits: 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    const offer = midnightApiTake({ buy: true });
    expect(() =>
      midnightTakeBorrow({
        ...params,
        takeableOffers: [
          { ...offer, offer: { ...offer.offer, maxAssets: maxUint128 + 1n } },
        ],
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: MidnightReferralFeePctExceededError", () => {
    expect(() =>
      midnightTakeBorrow({
        ...params,
        referralFeePct: 10n ** 17n + 1n,
        referralFeeRecipient: midnightAddresses.maker,
      }),
    ).toThrow(MidnightReferralFeePctExceededError);
  });

  test("error: ReferralFeePctExceededError at WAD", () => {
    expect(() =>
      midnightTakeBorrow({ ...params, referralFeePct: 10n ** 18n }),
    ).toThrow(ReferralFeePctExceededError);
  });
});
