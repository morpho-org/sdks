import {
  midnightBundlesAbi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { decodeFunctionData, type Hex, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightChainId,
  midnightMarket,
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import {
  EmptyMidnightTakeableOffersError,
  MidnightOfferSideMismatchError,
  MidnightTakeableOfferMarketMismatchError,
  type RequirementSignature,
} from "../../types/index.js";
import { midnightSupplyCollateralTakeBorrow } from "./supplyCollateralTakeBorrow.js";
import { PermitKind } from "./types.js";

const signature = `0x${"11".repeat(32)}${"22".repeat(32)}1b` as Hex;

describe("midnightSupplyCollateralTakeBorrow", () => {
  test("default", () => {
    const takeableOffers = [midnightApiTake({ buy: true })];
    const tx = midnightSupplyCollateralTakeBorrow({
      chainId: midnightChainId,
      market: midnightMarket,
      collateralAssets: 2_000n,
      loanAssets: 1_000n,
      maxUnits: 1_100n,
      taker: midnightAddresses.taker,
      takeableOffers,
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.midnightBundles);
    expect(tx.action.args.loanAssets).toBe(1_000n);
    expect(tx.action.type).toBe("midnightSupplyCollateralTakeBorrow");
    expect(decoded.functionName).toBe(
      "midnightBundlesV1SupplyCollateralAndSellWithAssetsTarget",
    );
    expect(decoded.args[0]).toBe(1_000n);
    expect(decoded.args[1]).toBe(1_100n);
    expect(decoded.args?.[5]).toMatchObject([
      {
        permit: {
          kind: PermitKind.None,
          data: "0x",
        },
      },
    ]);
  });

  test("behavior: encodes collateral token permit", () => {
    const tx = midnightSupplyCollateralTakeBorrow({
      chainId: midnightChainId,
      market: midnightMarket,
      collateralAssets: 2_000n,
      loanAssets: 1_000n,
      maxUnits: 1_100n,
      taker: midnightAddresses.taker,
      takeableOffers: [midnightApiTake({ buy: true })],
      deadline: maxUint256,
      signatures: [
        {
          action: {
            type: "permit",
            args: {
              spender: midnightAddresses.midnightBundles,
              amount: 2_000n,
              deadline: 123n,
            },
          },
          args: {
            owner: midnightAddresses.taker,
            nonce: 0n,
            asset: midnightAddresses.collateralToken,
            signature,
            amount: 2_000n,
            deadline: 123n,
          },
        } satisfies RequirementSignature,
      ],
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(decoded.args?.[5]).toMatchObject([
      {
        permit: {
          kind: PermitKind.ERC2612,
        },
      },
    ]);
  });

  test("error: EmptyMidnightTakeableOffersError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takeableOffers: [],
        deadline: maxUint256,
      }),
    ).toThrow(EmptyMidnightTakeableOffersError);
  });

  test("error: MidnightOfferSideMismatchError", () => {
    const takeableOffers = [midnightApiTake()];

    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takeableOffers,
        deadline: maxUint256,
      }),
    ).toThrow(MidnightOfferSideMismatchError);
  });

  test("error: MidnightTakeableOfferMarketMismatchError", () => {
    const takeableOffers = [
      midnightApiTake({ buy: true, market: midnightOtherMarket }),
    ];

    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takeableOffers,
        deadline: maxUint256,
      }),
    ).toThrow(MidnightTakeableOfferMarketMismatchError);
  });

  test("error: UnknownCollateralIndexError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        collateralIndex: 1n,
        takeableOffers: [midnightApiTake({ buy: true })],
        deadline: maxUint256,
      }),
    ).toThrow(UnknownCollateralIndexError);
  });
});
