import {
  AccrualVaultV2MorphoMarketV1AdapterV2,
  getChainAddress,
  VaultV2BluePublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import { createViemTest } from "@morpho-org/test/vitest";
import { parseEther } from "viem";
import { base } from "viem/chains";
import { assert, describe, expect } from "vitest";
import { vaultV2Abi, vaultV2BluePublicAllocatorAbi } from "../../abis.js";
import { fetchAccrualVaultV2 } from "./VaultV2.js";
import { fetchVaultV2BluePublicAllocatorData } from "./VaultV2BluePublicAllocatorConfig.js";

const vaultV2BluePublicAllocatorTest = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 50_063_965, // BluePublicAllocator deployment block.
  stepsTracing: false,
});

describe("Vault V2 BluePublicAllocator fetchers on fork", () => {
  vaultV2BluePublicAllocatorTest(
    "default: matches direct reads against the deployless query",
    async ({ client }) => {
      const forkVault = await fetchAccrualVaultV2(
        "0x4C7b69b4a82e9E5D8ec60E96516f7A0E17CBC55C",
        client,
      );
      const forkAdapter = forkVault.accrualAdapters.find(
        (candidate) =>
          candidate instanceof AccrualVaultV2MorphoMarketV1AdapterV2,
      );
      assert(forkAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2);

      const forkMarket = forkAdapter.markets[0];
      assert(forkMarket != null);

      const allocator = getChainAddress(base.id, "vaultV2BluePublicAllocator");
      const allocatorAccount = await client.readContract({
        address: forkVault.address,
        abi: vaultV2Abi,
        functionName: "curator",
      });
      assert(
        await client.readContract({
          address: forkVault.address,
          abi: vaultV2Abi,
          functionName: "isAllocator",
          args: [allocatorAccount],
        }),
      );
      await client.deal({
        account: allocatorAccount,
        amount: parseEther("1"),
      });
      const forkAdapterMarketCapId = forkAdapter.ids(forkMarket.params)[2];
      await client.writeContract({
        account: allocatorAccount,
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setCanPullFromIdle",
        args: [forkVault.address, true],
      });
      await client.writeContract({
        account: allocatorAccount,
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setPenalty",
        args: [forkVault.address, 12n],
      });
      await client.writeContract({
        account: allocatorAccount,
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setAbsoluteCap",
        args: [forkVault.address, forkAdapter.address, forkMarket.params, 500n],
      });
      await client.writeContract({
        account: allocatorAccount,
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setCanPullFromMarket",
        args: [forkVault.address, forkAdapter.address, forkMarket.params, true],
      });
      await client.writeContract({
        account: allocatorAccount,
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setIsActiveAdapter",
        args: [forkVault.address, forkAdapter.address, true],
      });

      const [deployless, direct] = await Promise.all([
        fetchVaultV2BluePublicAllocatorData(forkVault, client, {
          deployless: "force",
        }),
        fetchVaultV2BluePublicAllocatorData(forkVault, client, {
          deployless: false,
        }),
      ]);

      expect(deployless).toStrictEqual(direct);
      expect(deployless.publicAllocatorConfig).toBeInstanceOf(
        VaultV2BluePublicAllocatorConfig,
      );
      expect(deployless.publicAllocatorConfig).toStrictEqual(
        new VaultV2BluePublicAllocatorConfig({
          vault: forkVault.address,
          canPullFromIdle: true,
          penalty: 12n,
        }),
      );
      expect(deployless.activeAdapters).toStrictEqual(
        new Set([forkAdapter.address]),
      );
      expect(
        deployless.marketPublicAllocatorConfigs[forkAdapterMarketCapId],
      ).toStrictEqual({
        vault: forkVault.address,
        adapter: forkAdapter.address,
        adapterMarketCapId: forkAdapterMarketCapId,
        absoluteCap: 500n,
        canPullFromMarket: true,
      });
      expect(
        Object.values(deployless.allocations).some(
          (allocation) =>
            allocation != null &&
            (allocation.absoluteCap > 0n ||
              allocation.relativeCap > 0n ||
              allocation.allocation > 0n),
        ),
      ).toBe(true);
    },
  );
});
