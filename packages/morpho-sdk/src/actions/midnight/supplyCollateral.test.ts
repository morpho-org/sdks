import { midnightAbi } from "@morpho-org/midnight-sdk";
import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
} from "../../../test/fixtures/midnight.js";
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
});
