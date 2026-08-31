import {
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  getChainAddress,
  Market,
  MarketParams,
  MathLib,
  VaultV2BlueMarketPublicAllocatorConfig,
  VaultV2BluePublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  mockDeploylessRead,
  mockDeploylessReads,
} from "../../__test__/viem.js";
import { vaultV2Abi, vaultV2BluePublicAllocatorAbi } from "../../abis.js";
import { abi as queryAbi } from "../../queries/vault-v2/GetVaultV2BluePublicAllocatorConfig.js";
import { fetchVaultV2BlueMarketPublicAllocatorConfig } from "./VaultV2BlueMarketPublicAllocatorConfig.js";
import {
  fetchVaultV2BluePublicAllocatorConfig,
  fetchVaultV2BluePublicAllocatorData,
} from "./VaultV2BluePublicAllocatorConfig.js";

const ALLOCATOR = getChainAddress(mainnet.id, "vaultV2BluePublicAllocator");
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
const unallocatedTargetAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
  {
    address: ADAPTER,
    parentVault: VAULT,
    skimRecipient: zeroAddress,
    marketIds: [],
    adaptiveCurveIrm: IRM,
    supplyShares: {},
  },
  [],
);
const unallocatedTargetVault = new AccrualVaultV2(
  {
    ...vault,
    liquidityAllocations: vault.liquidityAllocations?.map((allocation) => ({
      ...allocation,
    })),
  },
  undefined,
  [unallocatedTargetAdapter],
  vault.assetBalance,
  { ...vault.forceDeallocatePenalties },
);
const ids = adapter.ids(marketParams);
const [, , adapterMarketCapId] = ids;

const expected = {
  publicAllocatorConfig: new VaultV2BluePublicAllocatorConfig({
    vault: VAULT,
    canPullFromIdle: true,
    penalty: 12n,
  }),
  activeAdapters: new Set([ADAPTER]),
  marketPublicAllocatorConfigs: {
    [adapterMarketCapId]: new VaultV2BlueMarketPublicAllocatorConfig({
      vault: VAULT,
      adapter: ADAPTER,
      adapterMarketCapId,
      absoluteCap: 500n,
      canPullFromMarket: true,
    }),
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

const mockDirectReads = (
  handle: ReturnType<typeof createMockClient>,
  isActiveAdapter = true,
) => {
  mockRead(handle, {
    address: VAULT,
    abi: vaultV2Abi,
    functionName: "isAllocator",
    result: true,
  });
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
    result: isActiveAdapter,
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

describe("Vault V2 BluePublicAllocator fetchers", () => {
  test("default: leaf fetchers use the chain allocator", async () => {
    const handle = createMockClient(mainnet);
    mockDirectReads(handle);

    const config = await fetchVaultV2BluePublicAllocatorConfig(
      VAULT,
      handle.client,
    );
    expect(config).toBeInstanceOf(VaultV2BluePublicAllocatorConfig);
    expect(config).toStrictEqual(expected.publicAllocatorConfig);
    const marketConfig = await fetchVaultV2BlueMarketPublicAllocatorConfig(
      VAULT,
      ADAPTER,
      adapterMarketCapId,
      handle.client,
    );
    expect(marketConfig).toBeInstanceOf(VaultV2BlueMarketPublicAllocatorConfig);
    expect(marketConfig).toStrictEqual(
      expected.marketPublicAllocatorConfigs[adapterMarketCapId],
    );
  });

  test("behavior: deployless batching includes an unallocated target", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, queryAbi, "query", {
      isAllocator: true,
      canPullFromIdle: true,
      penalty: 12n,
      isActiveAdapters: [true],
      marketConfigs: [
        {
          adapter: ADAPTER,
          adapterMarketCapId,
          absoluteCap: 500n,
          canPullFromMarket: true,
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
      fetchVaultV2BluePublicAllocatorData(
        unallocatedTargetVault,
        handle.client,
        { targetMarketParams: marketParams },
      ),
    ).resolves.toStrictEqual(expected);
  });

  test("behavior: direct-read fallback includes an unallocated target", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [new Error("deployless unavailable")]);
    mockDirectReads(handle);

    await expect(
      fetchVaultV2BluePublicAllocatorData(
        unallocatedTargetVault,
        handle.client,
        { targetMarketParams: marketParams },
      ),
    ).resolves.toStrictEqual(expected);
  });

  test("behavior: deployless batching omits config when the allocator is unauthorized", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, queryAbi, "query", {
      isAllocator: false,
      canPullFromIdle: true,
      penalty: 12n,
      isActiveAdapters: [true],
      marketConfigs: [],
      allocations: [],
    });

    await expect(
      fetchVaultV2BluePublicAllocatorData(vault, handle.client),
    ).resolves.toMatchObject({ publicAllocatorConfig: undefined });
  });

  test("behavior: direct-read fallback omits config when the allocator is unauthorized", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [new Error("deployless unavailable")]);
    mockDirectReads(handle);
    mockRead(handle, {
      address: VAULT,
      abi: vaultV2Abi,
      functionName: "isAllocator",
      result: false,
    });

    await expect(
      fetchVaultV2BluePublicAllocatorData(vault, handle.client),
    ).resolves.toMatchObject({ publicAllocatorConfig: undefined });
  });

  test("error: forced deployless failure does not fall back", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [new Error("deployless unavailable")]);

    await expect(
      fetchVaultV2BluePublicAllocatorData(vault, handle.client, {
        deployless: "force",
      }),
    ).rejects.toThrow();
  });

  test("behavior: omits inactive adapters from the registry", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [new Error("deployless unavailable")]);
    mockDirectReads(handle, false);

    const result = await fetchVaultV2BluePublicAllocatorData(
      vault,
      handle.client,
    );

    expect(result.activeAdapters).toStrictEqual(new Set());
  });
});
