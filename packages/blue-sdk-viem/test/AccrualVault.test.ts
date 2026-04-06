import { describe, expect } from "vitest";
import { test } from "./setup.js";

import { ChainId } from "@gfxlabs/blue-sdk";

import { vaults } from "@gfxlabs/morpho-test";
import { fetchAccrualVault, fetchVault } from "../src/index.js";

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
