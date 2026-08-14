import { MarketParams } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcBlue } from "../../test/fixtures/blue.js";
import type { BlueReallocation } from "../types/index.js";
import {
  computeBluePublicAllocatorPenaltyAssets,
  computeVaultV2ReallocationPenaltyAssets,
} from "./bluePublicAllocator.js";

const marketParams = new MarketParams(CbbtcUsdcBlue);

describe("computeBluePublicAllocatorPenaltyAssets", () => {
  test("default", () => {
    expect(
      computeBluePublicAllocatorPenaltyAssets(
        1_000_000n,
        1_000_000_000_000_000n,
      ),
    ).toBe(1_000n);
  });

  test("behavior: rounds each positive fractional penalty up", () => {
    expect(computeBluePublicAllocatorPenaltyAssets(1n, 1n)).toBe(1n);
  });
});

describe("computeVaultV2ReallocationPenaltyAssets", () => {
  test("default", () => {
    const reallocations: BlueReallocation[] = [
      {
        vault: CbbtcUsdcBlue.oracle,
        fee: 7n,
        withdrawals: [{ marketParams, amount: 1n }],
      },
      {
        type: "bluePublicAllocator",
        allocator: CbbtcUsdcBlue.irm,
        vault: CbbtcUsdcBlue.oracle,
        from: { type: "idle" },
        to: { adapter: CbbtcUsdcBlue.collateralToken },
        assets: 1n,
        penalty: 1n,
      },
      {
        type: "bluePublicAllocator",
        allocator: CbbtcUsdcBlue.irm,
        vault: CbbtcUsdcBlue.oracle,
        from: { type: "idle" },
        to: { adapter: CbbtcUsdcBlue.collateralToken },
        assets: 1n,
        penalty: 1n,
      },
    ];

    expect(computeVaultV2ReallocationPenaltyAssets(reallocations)).toBe(2n);
  });
});
