import { ChainId } from "@morpho-org/blue-sdk";
import { vaults } from "@morpho-org/morpho-test";
import { describe, expect } from "vitest";
import { fetchAccrualVault, fetchVault } from "../src/index.js";
import { test } from "./setup.js";

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
    expect(accrualVault.totalAssets).not.toEqual(accruedVault.totalAssets);
  });
});
