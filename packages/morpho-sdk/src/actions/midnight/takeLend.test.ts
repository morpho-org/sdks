import { midnightBundlesAbi } from "@morpho-org/midnight-sdk";
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
  EmptyMidnightTakeableOffersError,
  MidnightOfferSideMismatchError,
  MidnightTakeableOfferMarketMismatchError,
  type TokenRequirementSignature,
} from "../../types/index.js";
import { midnightTakeLend } from "./takeLend.js";
import { PermitKind } from "./types.js";

describe("midnightTakeLend", () => {
  test("default", () => {
    const takeableOffers = [midnightApiTake()];
    const tx = midnightTakeLend({
      chainId: midnightChainId,
      market: midnightMarket,
      assets: 1_000n,
      minUnits: 900n,
      taker: midnightAddresses.taker,
      takeableOffers,
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.midnightBundles);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      assets: 1_000n,
      minUnits: 900n,
      taker: midnightAddresses.taker,
      reduceOnly: false,
      takeableOffers: 1,
      collateralWithdrawals: 0,
      collateralReceiver: zeroAddress,
      referralFeePct: 0n,
      referralFeeRecipient: zeroAddress,
      maxContinuousFee: maxUint256,
      deadline: maxUint256,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV1BuyWithAssetsTargetAndWithdrawCollateral",
    );
    expect(decoded.args[0]).toBe(1_000n);
    expect(decoded.args[1]).toBe(900n);
    expect(decoded.args?.[4]).toEqual({
      kind: PermitKind.None,
      data: "0x",
    });
  });

  test("behavior: encodes loan token permit", () => {
    const tx = midnightTakeLend({
      chainId: midnightChainId,
      market: midnightMarket,
      assets: 1_000n,
      minUnits: 900n,
      taker: midnightAddresses.taker,
      takeableOffers: [midnightApiTake()],
      deadline: maxUint256,
      signatures: [
        {
          action: {
            type: "permit2Transfer",
            args: {
              spender: midnightAddresses.midnightBundles,
              amount: 1_000n,
              deadline: 123n,
            },
          },
          args: {
            owner: midnightAddresses.taker,
            nonce: 42n,
            asset: midnightAddresses.loanToken,
            signature: "0x1234",
            amount: 1_000n,
            deadline: 123n,
          },
        } satisfies TokenRequirementSignature,
      ],
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(decoded.args?.[4]).toMatchObject({
      kind: PermitKind.Permit2,
    });
  });

  test("error: EmptyMidnightTakeableOffersError", () => {
    expect(() =>
      midnightTakeLend({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1_000n,
        minUnits: 900n,
        taker: midnightAddresses.taker,
        takeableOffers: [],
        deadline: maxUint256,
      }),
    ).toThrow(EmptyMidnightTakeableOffersError);
  });

  test("error: MidnightOfferSideMismatchError", () => {
    const takeableOffers = [midnightApiTake({ buy: true })];

    expect(() =>
      midnightTakeLend({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1_000n,
        minUnits: 900n,
        taker: midnightAddresses.taker,
        takeableOffers,
        deadline: maxUint256,
      }),
    ).toThrow(MidnightOfferSideMismatchError);
  });

  test("error: MidnightTakeableOfferMarketMismatchError", () => {
    const takeableOffers = [midnightApiTake({ market: midnightOtherMarket })];

    expect(() =>
      midnightTakeLend({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1_000n,
        minUnits: 900n,
        taker: midnightAddresses.taker,
        takeableOffers,
        deadline: maxUint256,
      }),
    ).toThrow(MidnightTakeableOfferMarketMismatchError);
  });
});
