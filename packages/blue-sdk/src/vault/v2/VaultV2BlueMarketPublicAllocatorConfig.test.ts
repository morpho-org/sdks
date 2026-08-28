import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { VaultV2BlueMarketPublicAllocatorConfig } from "./VaultV2BlueMarketPublicAllocatorConfig.js";

describe("VaultV2BlueMarketPublicAllocatorConfig", () => {
  test("default", () => {
    const config = new VaultV2BlueMarketPublicAllocatorConfig({
      vault: zeroAddress,
      adapter: zeroAddress,
      adapterMarketCapId: `0x${"00".repeat(32)}`,
      absoluteCap: 100n,
      canPullFromMarket: true,
    });

    expect(config.getMaxIn(40n)).toBe(60n);
  });
});
