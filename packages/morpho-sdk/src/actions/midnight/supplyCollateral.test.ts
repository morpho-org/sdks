import {
  midnightAbi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
} from "../../../test/fixtures/midnight.js";
import { NonPositiveInputError } from "../../types/index.js";
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
    expect(decoded.functionName).toBe("supplyCollateral");
  });

  test("behavior: uses explicit collateral index and appends metadata", () => {
    const tx = midnightSupplyCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      collateralIndex: 0n,
      assets: 2_000n,
      onBehalf: midnightAddresses.taker,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.action.args.collateralIndex).toBe(0n);
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
});
