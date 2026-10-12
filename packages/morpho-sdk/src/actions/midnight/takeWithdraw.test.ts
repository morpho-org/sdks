import { MarketUtils, midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { decodeFunctionData, maxUint256, zeroAddress } from "viem";
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
  MidnightOfferSideMismatchError,
  MidnightTakeableOfferMarketMismatchError,
  NonPositiveInputError,
  ReferralFeeRecipientMissingError,
  UnboundedMidnightTakeInputError,
} from "../../types/index.js";
import { midnightTakeWithdraw } from "./takeWithdraw.js";

const midnightBundlesV2 = getChainAddress(midnightChainId, "midnightBundlesV2");

const params = {
  chainId: midnightChainId,
  market: midnightMarket,
  target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
  receiver: midnightAddresses.taker,
  takeableOffers: [midnightApiTake({ buy: true })],
  deadline: 600n,
} as const;

describe("midnightTakeWithdraw", () => {
  test("default", () => {
    const tx = midnightTakeWithdraw(params);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightBundlesV2);
    expect(tx.value).toBe(0n);
    expect(Object.isFrozen(tx)).toBe(true);
    expect(tx.action.type).toBe("midnightTakeWithdraw");
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
      receiver: midnightAddresses.taker,
      takeableOffers: 1,
      deadline: 600n,
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
      true,
      midnightAddresses.taker,
      [],
      [expect.objectContaining({ units: 100n, ratifierData: "0x1234" })],
      0n,
      zeroAddress,
      600n,
      zeroAddress,
    ]);
  });

  test("behavior: units target selects the units-target entrypoint", () => {
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: midnightTakeWithdraw({
        ...params,
        target: { type: "units", units: 1_100n, minSellerAssets: 1n },
      }).data,
    });

    expect(decoded.functionName).toBe(
      "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
    );
    // targetUnits, minSellerAssets, reduceOnly
    expect(decoded.args.slice(1, 4)).toEqual([1_100n, 1n, true]);
  });

  test("behavior: encodes the referral fee", () => {
    const tx = midnightTakeWithdraw({
      ...params,
      referralFeePct: 10n ** 16n,
      referralFeeRecipient: midnightAddresses.maker,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.action.args.referralFeePct).toBe(10n ** 16n);
    expect(tx.action.args.referralFeeRecipient).toBe(midnightAddresses.maker);
    expect(decoded.args.slice(7, 9)).toEqual([
      10n ** 16n,
      midnightAddresses.maker,
    ]);
  });

  test("behavior: appends metadata", () => {
    const tx = midnightTakeWithdraw({
      ...params,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        market: { ...midnightMarket, chainId: BigInt(midnightChainId + 1) },
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        target: { type: "assets", assets: 0n, maxUnits: 1_100n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        target: { type: "assets", assets: 1_000n, maxUnits: 0n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        target: { type: "units", units: 0n, minSellerAssets: 0n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        target: { type: "units", units: 1n, minSellerAssets: 0n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() => midnightTakeWithdraw({ ...params, deadline: 0n })).toThrow(
      NonPositiveInputError,
    );
  });

  test("error: UnboundedMidnightTakeInputError", () => {
    expect(() =>
      midnightTakeWithdraw({ ...params, deadline: maxUint256 }),
    ).toThrow(UnboundedMidnightTakeInputError);
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        target: { type: "assets", assets: 1_000n, maxUnits: maxUint256 },
      }),
    ).toThrow(UnboundedMidnightTakeInputError);
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        target: { type: "units", units: maxUint256, minSellerAssets: 1n },
      }),
    ).toThrow(UnboundedMidnightTakeInputError);
  });

  test("error: InputExceedsMaxError", () => {
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        target: { type: "assets", assets: maxUint256 + 1n, maxUnits: 1_100n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        target: { type: "assets", assets: 1_000n, maxUnits: maxUint256 + 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        target: { type: "units", units: maxUint256 + 1n, minSellerAssets: 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        target: { type: "units", units: 1n, minSellerAssets: maxUint256 + 1n },
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: NonPositiveInputError for negative minimum", () => {
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        target: { type: "units", units: 1n, minSellerAssets: -1n },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: ReferralFeeRecipientMissingError", () => {
    expect(() =>
      midnightTakeWithdraw({ ...params, referralFeePct: 1n }),
    ).toThrow(ReferralFeeRecipientMissingError);
  });

  test("error: EmptyMidnightTakeableOffersError", () => {
    expect(() =>
      midnightTakeWithdraw({ ...params, takeableOffers: [] }),
    ).toThrow(EmptyMidnightTakeableOffersError);
  });

  test("error: MidnightOfferSideMismatchError", () => {
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        takeableOffers: [midnightApiTake({ buy: false })],
      }),
    ).toThrow(MidnightOfferSideMismatchError);
  });

  test("error: MidnightTakeableOfferMarketMismatchError", () => {
    expect(() =>
      midnightTakeWithdraw({
        ...params,
        takeableOffers: [
          midnightApiTake({ buy: true, market: midnightOtherMarket }),
        ],
      }),
    ).toThrow(MidnightTakeableOfferMarketMismatchError);
  });
});
