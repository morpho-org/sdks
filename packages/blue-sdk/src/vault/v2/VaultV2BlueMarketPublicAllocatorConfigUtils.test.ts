import { describe, expect, test } from "vitest";
import { VaultV2BlueMarketPublicAllocatorConfigUtils } from "./VaultV2BlueMarketPublicAllocatorConfigUtils.js";

describe("VaultV2BlueMarketPublicAllocatorConfigUtils.getMaxIn", () => {
  test("behavior: floors exhausted capacity at zero", () => {
    expect(
      VaultV2BlueMarketPublicAllocatorConfigUtils.getMaxIn(
        { absoluteCap: 100n },
        101n,
      ),
    ).toBe(0n);
  });
});
