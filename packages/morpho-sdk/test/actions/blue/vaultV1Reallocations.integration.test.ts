import { parseUnits } from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  ChainIdMismatchError,
  morphoViemExtension,
} from "../../../src/index.js";
import { CbbtcUsdcBlue } from "../../fixtures/blue.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { test } from "../../setup.js";

// High-level Blue writes no longer accept Vault V1 reallocations, but
// `getVaultV1ReallocationData` and `getVaultV1Reallocations` remain public,
// deprecated, RPC-backed compatibility surfaces for explicit low-level Bundler3
// composition. These fork tests keep their batched-fetch + planner path covered;
// the wider V1 high-level end-to-end suite was removed with the V1 write path.
describe("getVaultV1ReallocationData + getVaultV1Reallocations", () => {
  test("behavior: computes a reallocation plan when the borrow needs shared liquidity", async ({
    client,
  }) => {
    const borrowAmount = parseUnits("50000000", 6);
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const block = await client.getBlock();

    const reallocationData = await market.getVaultV1ReallocationData({
      vaultAddresses: [SteakhouseUsdcVaultV1.address],
      block,
    });
    const reallocations = market.getVaultV1Reallocations({
      reallocationData,
      operation: "borrow",
      amount: borrowAmount,
      options: { timestamp: block.timestamp },
    });

    expect(reallocations.length).toBeGreaterThan(0);
    for (const reallocation of reallocations) {
      expect(reallocation.vault).toBeDefined();
      expect(reallocation.fee).toBeGreaterThanOrEqual(0n);
      expect(reallocation.withdrawals.length).toBeGreaterThan(0);
      for (const withdrawal of reallocation.withdrawals) {
        expect(withdrawal.amount).toBeGreaterThan(0n);
        expect(withdrawal.marketParams).toBeDefined();
      }
    }
  });

  test("behavior: returns an empty plan when liquidity already suffices", async ({
    client,
  }) => {
    const borrowAmount = parseUnits("1", 6);
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const block = await client.getBlock();

    const reallocationData = await market.getVaultV1ReallocationData({
      vaultAddresses: [SteakhouseUsdcVaultV1.address],
      block,
    });
    const reallocations = market.getVaultV1Reallocations({
      reallocationData,
      operation: "borrow",
      amount: borrowAmount,
      options: { timestamp: block.timestamp },
    });

    expect(reallocations).toEqual([]);
  });

  test("error: ChainIdMismatchError when the client chain differs from the market chain", async ({
    client,
  }) => {
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, base.id);

    await expect(
      market.getVaultV1ReallocationData({
        vaultAddresses: [SteakhouseUsdcVaultV1.address],
        block: { number: 0n, timestamp: 0n },
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });
});
