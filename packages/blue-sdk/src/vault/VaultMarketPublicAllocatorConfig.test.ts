import { describe, expect, test } from "vitest";
import type { Address, MarketId } from "../types.js";
import { VaultMarketPublicAllocatorConfig } from "./VaultMarketPublicAllocatorConfig.js";

const VAULT: Address = "0x1111111111111111111111111111111111111111";
const MARKET: MarketId =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as MarketId;

describe("VaultMarketPublicAllocatorConfig", () => {
  test("stores all four fields", () => {
    const c = new VaultMarketPublicAllocatorConfig({
      vault: VAULT,
      marketId: MARKET,
      maxIn: 100n,
      maxOut: 50n,
    });
    expect(c.vault).toBe(VAULT);
    expect(c.marketId).toBe(MARKET);
    expect(c.maxIn).toBe(100n);
    expect(c.maxOut).toBe(50n);
  });

  test("maxIn and maxOut are mutable; vault and marketId are readonly to TS", () => {
    const c = new VaultMarketPublicAllocatorConfig({
      vault: VAULT,
      marketId: MARKET,
      maxIn: 0n,
      maxOut: 0n,
    });
    c.maxIn = 1n;
    c.maxOut = 2n;
    expect(c.maxIn).toBe(1n);
    expect(c.maxOut).toBe(2n);
  });
});
