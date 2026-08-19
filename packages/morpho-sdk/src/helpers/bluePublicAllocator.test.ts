import { MarketParams } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcBlue } from "../../test/fixtures/blue.js";
import type { BlueReallocation } from "../types/index.js";
import { computeVaultV2BlueReallocationPenaltyAssets } from "./bluePublicAllocator.js";

const marketParams = new MarketParams(CbbtcUsdcBlue);

describe("computeVaultV2BlueReallocationPenaltyAssets", () => {
  test("default", () => {
    const reallocations: BlueReallocation[] = [
      {
        vault: CbbtcUsdcBlue.oracle,
        fee: 7n,
        withdrawals: [{ marketParams, amount: 1n }],
      },
      {
        vault: CbbtcUsdcBlue.oracle,
        from: { type: "idle" },
        to: { adapter: CbbtcUsdcBlue.collateralToken },
        assets: 1n,
        penalty: 1n,
      },
      {
        vault: CbbtcUsdcBlue.oracle,
        from: { type: "idle" },
        to: { adapter: CbbtcUsdcBlue.collateralToken },
        assets: 1n,
        penalty: 1n,
      },
    ];

    expect(computeVaultV2BlueReallocationPenaltyAssets(reallocations)).toBe(2n);
  });
});
