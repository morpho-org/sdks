import {
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  Market,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import {
  abi as fixtureAbi,
  code as fixtureCode,
} from "../../../test/fixtures/BluePublicAllocatorReadFixture.js";
import { vaultV2Test } from "../../../test/setup.js";
import {
  mockDeploylessRead,
  mockDeploylessReads,
} from "../../__test__/viem.js";
import { vaultV2Abi, vaultV2BluePublicAllocatorAbi } from "../../abis.js";
import { abi as queryAbi } from "../../queries/vault-v2/GetVaultV2PublicAllocatorConfig.js";
import { fetchAccrualVaultV2 } from "./VaultV2.js";
import {
  fetchVaultV2MarketPublicAllocatorConfig,
  fetchVaultV2PublicAllocatorConfig,
  fetchVaultV2PublicAllocatorData,
} from "./VaultV2PublicAllocatorConfig.js";

const ALLOCATOR: Address = "0x0000000000000000000000000000000000000001";
const VAULT: Address = "0x0000000000000000000000000000000000000002";
const ADAPTER: Address = "0x0000000000000000000000000000000000000003";
const ASSET: Address = "0x0000000000000000000000000000000000000004";
const IRM: Address = "0x0000000000000000000000000000000000000005";

const marketParams = new MarketParams({
  loanToken: ASSET,
  collateralToken: "0x0000000000000000000000000000000000000006",
  oracle: "0x0000000000000000000000000000000000000007",
  irm: IRM,
  lltv: 860_000_000_000_000_000n,
});
const market = new Market({
  params: marketParams,
  totalSupplyAssets: 100n,
  totalBorrowAssets: 0n,
  totalSupplyShares: 100_000_000n,
  totalBorrowShares: 0n,
  lastUpdate: 1n,
  fee: 0n,
});
const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
  {
    address: ADAPTER,
    parentVault: VAULT,
    skimRecipient: zeroAddress,
    marketIds: [market.id],
    adaptiveCurveIrm: IRM,
    supplyShares: { [market.id]: market.totalSupplyShares },
  },
  [market],
);
const vault = new AccrualVaultV2(
  {
    address: VAULT,
    asset: ASSET,
    _totalAssets: 100n,
    totalSupply: 100n,
    virtualShares: 0n,
    maxRate: 0n,
    lastUpdate: 1n,
    liquidityAdapter: zeroAddress,
    liquidityData: "0x",
    liquidityAllocations: undefined,
    performanceFee: 0n,
    managementFee: 0n,
    performanceFeeRecipient: zeroAddress,
    managementFeeRecipient: zeroAddress,
  },
  undefined,
  [adapter],
  0n,
  {},
);
const ids = adapter.ids(marketParams);
const marketParamsId = ids[2];

const expected = {
  publicAllocatorConfig: {
    allocator: ALLOCATOR,
    vault: VAULT,
    canPullFromIdle: true,
    penalty: 12n,
  },
  marketPublicAllocatorConfigs: {
    [marketParamsId]: {
      allocator: ALLOCATOR,
      vault: VAULT,
      adapter: ADAPTER,
      marketParamsId,
      absoluteCap: 500n,
      canPullFromMarket: true,
      isActiveAdapter: true,
    },
  },
  allocations: Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        absoluteCap: 1_000n,
        relativeCap: MathLib.WAD,
        allocation: 100n,
      },
    ]),
  ),
};

const mockDirectReads = (handle: ReturnType<typeof createMockClient>) => {
  mockRead(handle, {
    address: ALLOCATOR,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "vaultData",
    result: [true, 12n],
  });
  mockRead(handle, {
    address: ALLOCATOR,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "absoluteCap",
    result: 500n,
  });
  mockRead(handle, {
    address: ALLOCATOR,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "canPullFromMarket",
    result: true,
  });
  mockRead(handle, {
    address: ALLOCATOR,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "isActiveAdapter",
    result: true,
  });
  mockRead(handle, {
    address: VAULT,
    abi: vaultV2Abi,
    functionName: "absoluteCap",
    result: 1_000n,
  });
  mockRead(handle, {
    address: VAULT,
    abi: vaultV2Abi,
    functionName: "relativeCap",
    result: MathLib.WAD,
  });
  mockRead(handle, {
    address: VAULT,
    abi: vaultV2Abi,
    functionName: "allocation",
    result: 100n,
  });
};

describe("Vault V2 public allocator fetchers", () => {
  test("default: leaf fetchers preserve the explicit allocator identity", async () => {
    const handle = createMockClient(mainnet);
    mockDirectReads(handle);

    await expect(
      fetchVaultV2PublicAllocatorConfig(ALLOCATOR, VAULT, handle.client),
    ).resolves.toStrictEqual(expected.publicAllocatorConfig);
    await expect(
      fetchVaultV2MarketPublicAllocatorConfig(
        ALLOCATOR,
        VAULT,
        ADAPTER,
        marketParamsId,
        handle.client,
      ),
    ).resolves.toStrictEqual(
      expected.marketPublicAllocatorConfigs[marketParamsId],
    );
  });

  test("behavior: deployless batching returns all derived ids", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, queryAbi, "query", {
      canPullFromIdle: true,
      penalty: 12n,
      marketConfigs: [
        {
          adapter: ADAPTER,
          marketParamsId,
          absoluteCap: 500n,
          canPullFromMarket: true,
          isActiveAdapter: true,
        },
      ],
      allocations: ids.map((id) => ({
        id,
        absoluteCap: 1_000n,
        relativeCap: MathLib.WAD,
        allocation: 100n,
      })),
    });

    await expect(
      fetchVaultV2PublicAllocatorData(ALLOCATOR, vault, handle.client),
    ).resolves.toStrictEqual(expected);
  });

  test("behavior: direct-read fallback matches deployless output", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [new Error("deployless unavailable")]);
    mockDirectReads(handle);

    await expect(
      fetchVaultV2PublicAllocatorData(ALLOCATOR, vault, handle.client),
    ).resolves.toStrictEqual(expected);
  });
});

describe("Vault V2 public allocator fetchers on fork", () => {
  vaultV2Test(
    "matches direct reads against the deployless query",
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
      const { contractAddress: allocator } =
        await client.waitForTransactionReceipt({ hash: deploymentHash });
      assert(allocator != null);

      const forkMarketParamsId = forkAdapter.ids(forkMarket.params)[2];
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
        args: [forkVault.address, forkMarketParamsId, 500n],
      });
      await client.writeContract({
        address: allocator,
        abi: fixtureAbi,
        functionName: "setCanPullFromMarket",
        args: [forkVault.address, forkMarketParamsId, true],
      });
      await client.writeContract({
        address: allocator,
        abi: fixtureAbi,
        functionName: "setIsActiveAdapter",
        args: [forkVault.address, forkAdapter.address, true],
      });

      const [deployless, direct] = await Promise.all([
        fetchVaultV2PublicAllocatorData(allocator, forkVault, client, {
          deployless: "force",
        }),
        fetchVaultV2PublicAllocatorData(allocator, forkVault, client, {
          deployless: false,
        }),
      ]);

      expect(deployless).toStrictEqual(direct);
      expect(deployless.publicAllocatorConfig).toStrictEqual({
        allocator,
        vault: forkVault.address,
        canPullFromIdle: true,
        penalty: 12n,
      });
      expect(
        deployless.marketPublicAllocatorConfigs[forkMarketParamsId],
      ).toStrictEqual({
        allocator,
        vault: forkVault.address,
        adapter: forkAdapter.address,
        marketParamsId: forkMarketParamsId,
        absoluteCap: 500n,
        canPullFromMarket: true,
        isActiveAdapter: true,
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
