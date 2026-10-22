import {
  MarketUtils,
  midnightAbi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { decodeFunctionData, maxUint128, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
  midnightTwoCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  InputExceedsMaxError,
  MidnightZeroOnBehalfError,
  NonPositiveInputError,
} from "../../types/index.js";
import { midnightSupplyCollateral } from "./supplyCollateral.js";

describe("midnightSupplyCollateral", () => {
  test("default", () => {
    const tx = midnightSupplyCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      assets: 2_000n,
      onBehalf: midnightAddresses.taker,
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });

    expect(tx.to).toBe(midnightAddresses.midnight);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      collateralIndex: 0n,
      assets: 2_000n,
      onBehalf: midnightAddresses.taker,
    });
    expect(decoded).toEqual({
      functionName: "supplyCollateral",
      args: [
        MarketUtils.toStruct(midnightMarket),
        0n,
        2_000n,
        midnightAddresses.taker,
      ],
    });
  });

  test("behavior: uses explicit collateral index and appends metadata", () => {
    const tx = midnightSupplyCollateral({
      chainId: midnightChainId,
      market: midnightTwoCollateralMarket,
      collateralIndex: 1n,
      assets: 2_000n,
      onBehalf: midnightAddresses.taker,
      metadata: { origin: "a1b2c3d4" },
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });

    expect(tx.action.args.collateralIndex).toBe(1n);
    expect(decoded.args[1]).toBe(1n);
    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 0n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: MidnightZeroOnBehalfError for zero onBehalf", () => {
    const buildTx = () =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 2_000n,
        onBehalf: zeroAddress,
      });

    expect(buildTx).toThrow(MidnightZeroOnBehalfError);
    expect(buildTx).toThrow(expect.objectContaining({ field: "onBehalf" }));
  });

  test("error: assets above the uint128 collateral balance", () => {
    expect(() =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: maxUint128 + 1n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: UnknownCollateralIndexError", () => {
    expect(() =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralIndex: 1n,
        assets: 2_000n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: { ...midnightMarket, chainId: BigInt(midnightChainId + 1) },
        assets: 2_000n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(ChainIdMismatchError);
  });
});
