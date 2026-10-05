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
import { midnightTakeBorrow } from "./takeBorrow.js";

const midnightBundlesV2 = getAddress(
  "0x00000000000000000000000000000000000b2002",
);
registerCustomAddresses({
  addresses: { [midnightChainId]: { midnightBundlesV2 } },
});

const params = {
  chainId: midnightChainId,
  market: midnightMarket,
  target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
  receiver: midnightAddresses.taker,
  takeableOffers: [midnightApiTake({ buy: true })],
  deadline: maxUint256,
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
      deadline: maxUint256,
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
      maxUint256,
      zeroAddress,
    ]);
  });

  test("behavior: units target selects the units-target entrypoint", () => {
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: midnightTakeBorrow({
        ...params,
        target: { type: "units", units: 1_100n, minSellerAssets: 0n },
      }).data,
    });

    expect(decoded.functionName).toBe(
      "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
    );
    expect(decoded.args.slice(1, 3)).toEqual([1_100n, 0n]);
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
        target: { type: "units", units: 0n, minSellerAssets: 0n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() => midnightTakeBorrow({ ...params, deadline: 0n })).toThrow(
      NonPositiveInputError,
    );
  });

  test("error: NegativeInputError", () => {
    expect(() =>
      midnightTakeBorrow({
        ...params,
        target: { type: "units", units: 1n, minSellerAssets: -1n },
      }),
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
});
