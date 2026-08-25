import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { VaultV2BluePublicAllocatorConfig } from "./VaultV2BluePublicAllocatorConfig.js";

describe("VaultV2BluePublicAllocatorConfig", () => {
  test("default", () => {
    const config = new VaultV2BluePublicAllocatorConfig({
      vault: zeroAddress,
      canPullFromIdle: true,
      penalty: 500_000_000_000_000_000n,
    });

    expect(config.getPenaltyAssets(3n)).toBe(2n);
  });
});
