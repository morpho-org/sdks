import { describe, expect, test } from "vitest";
import { CbbtcUsdcBlue } from "../../test/fixtures/blue.js";
import type { VaultV2BlueReallocation } from "../types/index.js";
import { computeVaultV2BlueReallocationPenaltyAssets } from "./bluePublicAllocator.js";

describe("computeVaultV2BlueReallocationPenaltyAssets", () => {
  test("default", () => {
    const reallocations: VaultV2BlueReallocation[] = [
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
