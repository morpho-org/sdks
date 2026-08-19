import { describe, expect, test } from "vitest";
import { VaultV2BluePublicAllocatorConfigUtils } from "./VaultV2BluePublicAllocatorConfigUtils.js";

describe("VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets", () => {
  test("default", () => {
    expect(
      VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets(
        { penalty: 500_000_000_000_000_000n },
        3n,
      ),
    ).toBe(2n);
  });
});
