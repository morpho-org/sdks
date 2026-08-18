import {
  AccrualVaultV2MorphoMarketV1AdapterV2,
  ChainId,
  getChainAddress,
} from "@morpho-org/blue-sdk";
import { assert, describe, expect } from "vitest";
import {
  abi as fixtureAbi,
  code as fixtureCode,
} from "../../../test/fixtures/BluePublicAllocatorReadFixture.js";
import { vaultV2Test } from "../../../test/setup.js";
import { fetchAccrualVaultV2 } from "./VaultV2.js";
import { fetchVaultV2PublicAllocatorData } from "./VaultV2PublicAllocatorConfig.js";

describe("Vault V2 public allocator fetchers on fork", () => {
  vaultV2Test(
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

      const deploymentHash = await client.deployContract({
        abi: fixtureAbi,
        bytecode: fixtureCode,
      });
      const { contractAddress: fixture } =
        await client.waitForTransactionReceipt({ hash: deploymentHash });
      assert(fixture != null);
      const fixtureBytecode = await client.getBytecode({ address: fixture });
      assert(fixtureBytecode != null);
      const allocator = getChainAddress(
        ChainId.EthMainnet,
        "vaultV2BluePublicAllocator",
      );
      await client.setCode({ address: allocator, bytecode: fixtureBytecode });

      const forkAdapterMarketCapId = forkAdapter.ids(forkMarket.params)[2];
      await client.writeContract({
        address: allocator,
        abi: fixtureAbi,
        functionName: "setVaultData",
        args: [forkVault.address, true, 12n],
      });
      await client.writeContract({
        address: allocator,
        abi: fixtureAbi,
        functionName: "setAbsoluteCap",
        args: [forkVault.address, forkAdapterMarketCapId, 500n],
      });
      await client.writeContract({
        address: allocator,
        abi: fixtureAbi,
        functionName: "setCanPullFromMarket",
        args: [forkVault.address, forkAdapterMarketCapId, true],
      });
      await client.writeContract({
        address: allocator,
        abi: fixtureAbi,
        functionName: "setIsActiveAdapter",
        args: [forkVault.address, forkAdapter.address, true],
      });

      const [deployless, direct] = await Promise.all([
        fetchVaultV2PublicAllocatorData(forkVault, client, {
          deployless: "force",
        }),
        fetchVaultV2PublicAllocatorData(forkVault, client, {
          deployless: false,
        }),
      ]);

      expect(deployless).toStrictEqual(direct);
      expect(deployless.publicAllocatorConfig).toStrictEqual({
        vault: forkVault.address,
        canPullFromIdle: true,
        penalty: 12n,
      });
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
