import { MarketUtils, midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
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
  EmptyMidnightTakeableOffersError,
  MidnightOfferSideMismatchError,
  MidnightTakeableOfferMarketMismatchError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeeRecipientMissingError,
} from "../../types/index.js";
import { midnightTakeLend } from "./takeLend.js";

const midnightBundlesV2 = getAddress(
  "0x00000000000000000000000000000000000b2002",
);
registerCustomAddresses({
  addresses: { [midnightChainId]: { midnightBundlesV2 } },
});

const params = {
  chainId: midnightChainId,
  market: midnightMarket,
  target: { type: "assets", assets: 1_000n, minUnits: 900n },
  takeableOffers: [midnightApiTake()],
  maxContinuousFee: 7n,
  deadline: maxUint256,
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
      deadline: maxUint256,
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
      maxUint256,
      zeroAddress,
    ]);
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

  test("error: NegativeInputError", () => {
    expect(() =>
      midnightTakeLend({
        ...params,
        target: { type: "assets", assets: 1_000n, minUnits: -1n },
      }),
    ).toThrow(NegativeInputError);
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
    expect(() =>
      midnightTakeLend({
        ...params,
        takeableOffers: [midnightApiTake({ buy: true })],
      }),
    ).toThrow(MidnightOfferSideMismatchError);
  });

  test("error: MidnightTakeableOfferMarketMismatchError", () => {
    expect(() =>
      midnightTakeLend({
        ...params,
        takeableOffers: [midnightApiTake({ market: midnightOtherMarket })],
      }),
    ).toThrow(MidnightTakeableOfferMarketMismatchError);
  });
});
