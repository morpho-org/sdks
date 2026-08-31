import { ChainId, VaultConfig } from "@morpho-org/blue-sdk";
import { isAddress } from "viem";
import { describe, expect, test } from "vitest";
import { randomVault, vaults } from "./vaults.js";

describe("vaults fixture registry", () => {
  test("has entries for EthMainnet", () => {
    expect(vaults[ChainId.EthMainnet]).toBeDefined();
  });

  test("every entry is a VaultConfig instance with valid asset address", () => {
    for (const v of Object.values(vaults[ChainId.EthMainnet])) {
      expect(v).toBeInstanceOf(VaultConfig);
      expect(isAddress(v.address)).toBe(true);
      expect(isAddress(v.asset)).toBe(true);
    }
  });

  test("vault decimals are forced to 18 (vault token convention)", () => {
    for (const v of Object.values(vaults[ChainId.EthMainnet])) {
      expect(v.decimals).toBe(18);
    }
  });

  test("decimalsOffset is a valid bigint", () => {
    for (const v of Object.values(vaults[ChainId.EthMainnet])) {
      expect(typeof v.decimalsOffset).toBe("bigint");
      expect(v.decimalsOffset).toBeGreaterThanOrEqual(0n);
    }
  });

  test("steakUsdc fixture has the expected decimalsOffset", () => {
    expect(vaults[ChainId.EthMainnet].steakUsdc.decimalsOffset).toBe(12n);
  });
});

describe("randomVault", () => {
  test("returns a VaultConfig with random valid addresses", () => {
    const v = randomVault();
    expect(v).toBeInstanceOf(VaultConfig);
    expect(isAddress(v.address)).toBe(true);
    expect(isAddress(v.asset)).toBe(true);
  });

  test("accepts a partial config override", () => {
    const asset = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
    const v = randomVault({ asset, decimalsOffset: 12n });
    expect(v.asset).toBe(asset);
    expect(v.decimalsOffset).toBe(12n);
  });

  test("default symbol is 'TEST' and name is 'Test vault'", () => {
    const v = randomVault();
    expect(v.symbol).toBe("TEST");
    expect(v.name).toBe("Test vault");
  });

  test("decimalsOffset defaults to 0n", () => {
    expect(randomVault().decimalsOffset).toBe(0n);
  });
});
