import { ChainId } from "@morpho-org/blue-sdk";
import { vaults } from "@morpho-org/morpho-test";
import { describe, expect } from "vitest";
import { fetchAccrualVault, fetchVault } from "../src/index.js";
import { test, testTreehouseEth } from "./setup.js";

const { steakUsdc } = vaults[ChainId.EthMainnet];

describe("AccrualVault", () => {
  test("should accrue same totalAssets", async ({ client }) => {
    const [vault, accrualVault, block] = await Promise.all([
      fetchVault(steakUsdc.address, client),
      fetchAccrualVault(steakUsdc.address, client),
      client.getBlock(),
    ]);
    const accruedVault = accrualVault.accrueInterest(block.timestamp);

    expect(vault.totalAssets).toEqual(accruedVault.totalAssets);
    expect(accrualVault.totalAssets).toEqual(accruedVault.totalAssets);
  });

  testTreehouseEth(
    "should match onchain V1.1 lost-asset accounting",
    async ({ client }) => {
      const block = await client.getBlock();
      const address = "0x51056b3F809f4cFE17E1A8715B82f5dbbCA5a5A1";
      const [vault, accrualVault] = await Promise.all([
        fetchVault(address, client, { blockNumber: block.number }),
        fetchAccrualVault(address, client, { blockNumber: block.number }),
      ]);
      const allocatedAssets = [...accrualVault.allocations.values()].reduce(
        (total, { position }) => total + position.supplyAssets,
        0n,
      );
      const reaccruedVault = accrualVault.accrueInterest(block.timestamp);

      expect(vault.lostAssets).toBeGreaterThan(0n);
      expect(accrualVault.lostAssets).toBe(vault.lostAssets);
      expect(accrualVault.totalAssets).toBe(vault.totalAssets);
      expect(accrualVault.totalAssets).toBe(
        allocatedAssets + (accrualVault.lostAssets ?? 0n),
      );
      expect(reaccruedVault.totalAssets).toBe(accrualVault.totalAssets);
      expect(reaccruedVault.totalSupply).toBe(accrualVault.totalSupply);
    },
  );
});
