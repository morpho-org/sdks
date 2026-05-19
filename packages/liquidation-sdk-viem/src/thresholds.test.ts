import { ChainId } from "@morpho-org/blue-sdk";
import { parseEther } from "viem";
import { describe, expect, test } from "vitest";
import { collateralUsdThreshold } from "./thresholds.js";

describe("collateralUsdThreshold", () => {
  test("EthMainnet threshold is $1,000 (in WAD)", () => {
    expect(collateralUsdThreshold[ChainId.EthMainnet]).toBe(parseEther("1000"));
  });

  test("BaseMainnet threshold is $2 (in WAD)", () => {
    expect(collateralUsdThreshold[ChainId.BaseMainnet]).toBe(parseEther("2"));
  });

  test("PolygonMainnet threshold is $2 (in WAD)", () => {
    expect(collateralUsdThreshold[ChainId.PolygonMainnet]).toBe(
      parseEther("2"),
    );
  });

  test("ArbitrumMainnet threshold is $2 (in WAD)", () => {
    expect(collateralUsdThreshold[ChainId.ArbitrumMainnet]).toBe(
      parseEther("2"),
    );
  });

  test("all entries are non-negative bigints", () => {
    for (const v of Object.values(collateralUsdThreshold)) {
      expect(typeof v).toBe("bigint");
      expect(v).toBeGreaterThan(0n);
    }
  });
});
