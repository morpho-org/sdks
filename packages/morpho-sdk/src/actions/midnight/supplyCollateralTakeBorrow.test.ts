import { midnightBundlesAbi } from "@morpho-org/midnight-sdk";
import { decodeFunctionData, type Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightChainId,
  midnightMarket,
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import {
  EmptyMidnightTakesError,
  MidnightTakeMarketMismatchError,
  MidnightTakeSideMismatchError,
  type RequirementSignature,
  UnknownMidnightCollateralError,
} from "../../types/index.js";
import { midnightSupplyCollateralTakeBorrow } from "./supplyCollateralTakeBorrow.js";
import { PermitKind } from "./types.js";

const signature = `0x${"11".repeat(32)}${"22".repeat(32)}1b` as Hex;

describe("midnightSupplyCollateralTakeBorrow", () => {
  test("default", () => {
    const takes = [midnightApiTake({ buy: true })];
    const tx = midnightSupplyCollateralTakeBorrow({
      chainId: midnightChainId,
      market: midnightMarket,
      collateralAssets: 2_000n,
      loanAssets: 1_000n,
      maxUnits: 1_100n,
      taker: midnightAddresses.taker,
      takes,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.midnightBundles);
    expect(tx.action.args.loanAssets).toBe(1_000n);
    expect(tx.action.type).toBe("midnightSupplyCollateralTakeBorrow");
    expect(decoded.functionName).toBe(
      "supplyCollateralAndSellWithAssetsTarget",
    );
    expect(decoded.args[0]).toBe(1_000n);
    expect(decoded.args[1]).toBe(1_100n);
    expect(decoded.args?.[4]).toMatchObject([
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
      takes: [midnightApiTake({ buy: true })],
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

    expect(decoded.args?.[4]).toMatchObject([
      {
        permit: {
          kind: PermitKind.ERC2612,
        },
      },
    ]);
  });

  test("error: EmptyMidnightTakesError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takes: [],
      }),
    ).toThrow(EmptyMidnightTakesError);
  });

  test("error: MidnightTakeSideMismatchError", () => {
    const takes = [midnightApiTake()];

    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takes,
      }),
    ).toThrow(MidnightTakeSideMismatchError);
  });

  test("error: MidnightTakeMarketMismatchError", () => {
    const takes = [midnightApiTake({ buy: true, market: midnightOtherMarket })];

    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        takes,
      }),
    ).toThrow(MidnightTakeMarketMismatchError);
  });

  test("error: UnknownMidnightCollateralError", () => {
    expect(() =>
      midnightSupplyCollateralTakeBorrow({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 1_100n,
        taker: midnightAddresses.taker,
        collateralIndex: 1n,
        takes: [midnightApiTake({ buy: true })],
      }),
    ).toThrow(UnknownMidnightCollateralError);
  });
});
