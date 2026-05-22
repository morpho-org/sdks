import { describe, expect, test } from "vitest";
import type { Address } from "../types.js";
import { VaultConfig } from "./VaultConfig.js";

const VAULT: Address = "0x1111111111111111111111111111111111111111";
const ASSET: Address = "0x2222222222222222222222222222222222222222";

describe("VaultConfig", () => {
  test("forces decimals to 18 (vault token decimals)", () => {
    const c = new VaultConfig({
      address: VAULT,
      symbol: "vUSDC",
      asset: ASSET,
      decimalsOffset: 12,
    });
    expect(c.decimals).toBe(18);
  });

  test("stores asset and decimalsOffset (coerced to bigint)", () => {
    const c = new VaultConfig({
      address: VAULT,
      asset: ASSET,
      decimalsOffset: 12,
    });
    expect(c.asset).toBe(ASSET);
    expect(c.decimalsOffset).toBe(12n);
  });

  test("accepts decimalsOffset as bigint and string", () => {
    expect(
      new VaultConfig({
        address: VAULT,
        asset: ASSET,
        decimalsOffset: 6n,
      }).decimalsOffset,
    ).toBe(6n);
    expect(
      new VaultConfig({
        address: VAULT,
        asset: ASSET,
        decimalsOffset: "8",
      }).decimalsOffset,
    ).toBe(8n);
  });

  test("preserves Token base fields (name, symbol)", () => {
    const c = new VaultConfig({
      address: VAULT,
      name: "Yield USDC",
      symbol: "yUSDC",
      asset: ASSET,
      decimalsOffset: 12,
    });
    expect(c.name).toBe("Yield USDC");
    expect(c.symbol).toBe("yUSDC");
  });
});
