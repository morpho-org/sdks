import {
  type AccrualVaultV2MorphoMarketV1Adapter,
  type AccrualVaultV2MorphoMarketV1AdapterV2,
  AccrualVaultV2MorphoVaultV1Adapter,
  addressesRegistry,
  ChainId,
  MarketParams,
  marketParamsAbi,
  UnknownFactory,
  UnknownOfFactory,
  UnsupportedVaultV2AdapterError,
  VaultV2,
  VaultV2MorphoMarketV1Adapter,
  VaultV2MorphoMarketV1AdapterV2,
  VaultV2MorphoVaultV1Adapter,
} from "@morpho-org/blue-sdk";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Address,
  encodeAbiParameters,
  encodeErrorResult,
  erc20Abi,
  RawContractError,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  encodeReadResult,
  mockDeploylessRead,
  mockDeploylessReads,
  mockReadFailure,
} from "../../__test__/viem.js";
import {
  blueAbi,
  erc5267Abi,
  morphoMarketV1AdapterAbi,
  morphoMarketV1AdapterFactoryAbi,
  morphoMarketV1AdapterV2Abi,
  morphoMarketV1AdapterV2FactoryAbi,
  morphoVaultV1AdapterAbi,
  morphoVaultV1AdapterFactoryAbi,
  vaultV2Abi,
  vaultV2FactoryAbi,
} from "../../abis.js";
import { abi as marketQueryAbi } from "../../queries/GetMarket.js";
import { abi as vaultQueryAbi } from "../../queries/GetVault.js";
import { abi as vaultV2QueryAbi } from "../../queries/vault-v2/GetVaultV2.js";
import { abi as marketAdapterQueryAbi } from "../../queries/vault-v2/GetVaultV2MorphoMarketV1Adapter.js";
import { abi as marketAdapterV2QueryAbi } from "../../queries/vault-v2/GetVaultV2MorphoMarketV1AdapterV2.js";
import { abi as vaultAdapterQueryAbi } from "../../queries/vault-v2/GetVaultV2MorphoVaultV1Adapter.js";
import { fetchAccrualVaultV2, fetchVaultV2 } from "./VaultV2.js";
import {
  fetchAccrualVaultV2Adapter,
  fetchVaultV2Adapter,
} from "./VaultV2Adapter.js";
import { fetchVaultV2MorphoMarketV1Adapter } from "./VaultV2MorphoMarketV1Adapter.js";
import { fetchVaultV2MorphoMarketV1AdapterV2 } from "./VaultV2MorphoMarketV1AdapterV2.js";
import {
  fetchAccrualVaultV2MorphoVaultV1Adapter,
  fetchVaultV2MorphoVaultV1Adapter,
} from "./VaultV2MorphoVaultV1Adapter.js";

const CHAIN_ID = ChainId.EthMainnet;
const ADDRESSES = addressesRegistry[CHAIN_ID];

const VAULT: Address = "0x1111111111111111111111111111111111111111";
const ASSET: Address = "0x2222222222222222222222222222222222222222";
const ADAPTER: Address = "0x3333333333333333333333333333333333333333";
const ADAPTER_2: Address = "0x4444444444444444444444444444444444444444";
const RECIPIENT: Address = "0x5555555555555555555555555555555555555555";
const ORACLE: Address = "0x6666666666666666666666666666666666666666";
const COLLATERAL: Address = "0x7777777777777777777777777777777777777777";

const MARKET_PARAMS = new MarketParams({
  loanToken: ASSET,
  collateralToken: COLLATERAL,
  oracle: ORACLE,
  irm: ADDRESSES.adaptiveCurveIrm,
  lltv: 860000000000000000n,
});
const ID = MARKET_PARAMS.id;
const MARKET_DATA = encodeAbiParameters([marketParamsAbi], [MARKET_PARAMS]);
const DOMAIN = {
  fields: "0x1f",
  name: "Vault",
  version: "1",
  chainId: BigInt(CHAIN_ID),
  verifyingContract: VAULT,
  salt: "0x0000000000000000000000000000000000000000000000000000000000000000",
  extensions: [] as readonly bigint[],
} as const;

const tokenResult = {
  asset: ASSET,
  symbol: "v2MOCK",
  name: "Vault V2 Mock",
  decimals: 18n,
};

const vaultV2Result = {
  token: tokenResult,
  asset: ASSET,
  _totalAssets: 100n,
  totalSupply: 200n,
  virtualShares: 1n,
  maxRate: 3n,
  lastUpdate: 4n,
  adapters: [ADAPTER_2],
  liquidityAdapter: ADAPTER,
  liquidityData: "0x",
  isLiquidityAdapterKnown: true,
  liquidityAllocations: [
    {
      id: VaultV2MorphoVaultV1Adapter.adapterId(ADAPTER),
      absoluteCap: 1_000n,
      relativeCap: 1_000000000000000000n,
      allocation: 100n,
    },
  ],
  performanceFee: 5n,
  managementFee: 6n,
  performanceFeeRecipient: RECIPIENT,
  managementFeeRecipient: RECIPIENT,
} as const;

const marketQueryResult = {
  marketParams: [
    MARKET_PARAMS.loanToken,
    MARKET_PARAMS.collateralToken,
    MARKET_PARAMS.oracle,
    MARKET_PARAMS.irm,
    MARKET_PARAMS.lltv,
  ] as const,
  market: [100n, 200n, 30n, 40n, 5n, 6n] as const,
  hasPrice: true,
  price: 123n,
  rateAtTarget: 456n,
};

function mockTokenReads(handle: ReturnType<typeof createMockClient>) {
  mockRead(handle, {
    address: VAULT,
    abi: erc20Abi,
    functionName: "decimals",
    result: 18,
  });
  mockRead(handle, {
    address: VAULT,
    abi: erc20Abi,
    functionName: "symbol",
    result: "v2MOCK",
  });
  mockRead(handle, {
    address: VAULT,
    abi: erc20Abi,
    functionName: "name",
    result: "Vault V2 Mock",
  });
  mockReadFailure(handle, {
    address: VAULT,
    abi: erc5267Abi,
    functionName: "eip712Domain",
  });
}

function mockVaultV2BaseReads(handle: ReturnType<typeof createMockClient>) {
  mockTokenReads(handle);
  mockRead(handle, {
    address: ADDRESSES.vaultV2Factory,
    abi: vaultV2FactoryAbi,
    functionName: "isVaultV2",
    result: true,
  });
  for (const [functionName, result] of [
    ["asset", ASSET],
    ["totalSupply", 200n],
    ["_totalAssets", 100n],
    ["performanceFee", 5n],
    ["managementFee", 6n],
    ["virtualShares", 1n],
    ["lastUpdate", 4n],
    ["maxRate", 3n],
    ["liquidityAdapter", ADAPTER],
    ["liquidityData", "0x"],
    ["adaptersLength", 1n],
    ["performanceFeeRecipient", RECIPIENT],
    ["managementFeeRecipient", RECIPIENT],
  ] as const) {
    mockRead(handle, {
      address: VAULT,
      abi: vaultV2Abi,
      functionName,
      result,
    });
  }
  mockRead(handle, {
    address: VAULT,
    abi: vaultV2Abi,
    functionName: "adapters",
    result: ADAPTER_2,
  });
}

function mockVaultV2AllocationReads(
  handle: ReturnType<typeof createMockClient>,
  ids: readonly `0x${string}`[],
) {
  for (const id of ids) {
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
      result: 1_000000000000000000n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: vaultV2Abi,
      functionName: "allocation",
      result: id === ids[0] ? 100n : 0n,
    });
  }
}

function contractRevert(
  errorName: "UnknownOfFactory" | "UnsupportedVaultV2Adapter",
) {
  const abi = [
    {
      type: "error",
      name: "UnknownOfFactory",
      inputs: [{ type: "address" }, { type: "address" }],
    },
    {
      type: "error",
      name: "UnsupportedVaultV2Adapter",
      inputs: [{ type: "address" }],
    },
  ] as const;

  return new RawContractError({
    data: encodeErrorResult({
      abi,
      errorName,
      args:
        errorName === "UnsupportedVaultV2Adapter"
          ? [ADAPTER]
          : [ADDRESSES.vaultV2Factory, VAULT],
    }),
  });
}

describe("fetchVaultV2", () => {
  test("uses the deployless Vault V2 query", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, vaultV2QueryAbi, "query", vaultV2Result);

    const vault = await fetchVaultV2(VAULT, handle.client);

    expect(vault).toBeInstanceOf(VaultV2);
    expect(vault.address).toBe(VAULT);
    expect(vault.asset).toBe(ASSET);
    expect(vault.adapters).toEqual([ADAPTER_2]);
    expect(vault.liquidityAllocations?.[0]?.allocation).toBe(100n);
  });

  test("omits deployless liquidity allocations for unknown liquidity adapters", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, vaultV2QueryAbi, "query", {
      ...vaultV2Result,
      isLiquidityAdapterKnown: false,
    });

    const vault = await fetchVaultV2(VAULT, handle.client, {
      chainId: CHAIN_ID,
    });

    expect(vault.liquidityAllocations).toBeUndefined();
  });

  test("throws UnknownFactory when the chain has no Vault V2 factory", async () => {
    const { client } = createMockClient(mainnet);

    await expect(
      fetchVaultV2(VAULT, client, { chainId: ChainId.CeloMainnet }),
    ).rejects.toThrow(UnknownFactory);
  });

  test("uses multicall and Vault V1 adapter liquidity allocations", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockVaultV2BaseReads(handle);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: true,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: false,
    });
    mockVaultV2AllocationReads(handle, [
      VaultV2MorphoVaultV1Adapter.adapterId(ADAPTER),
    ]);

    const vault = await fetchVaultV2(VAULT, handle.client, {
      chainId: CHAIN_ID,
    });

    expect(vault.liquidityAllocations).toHaveLength(1);
    expect(vault.liquidityAllocations?.[0]?.id).toBe(
      VaultV2MorphoVaultV1Adapter.adapterId(ADAPTER),
    );
  });

  test("uses multicall directly when deployless is disabled", async () => {
    const handle = createMockClient(mainnet);
    mockVaultV2BaseReads(handle);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: false,
    });

    const vault = await fetchVaultV2(VAULT, handle.client, {
      chainId: CHAIN_ID,
      deployless: false,
    });

    expect(vault.liquidityAllocations).toBeUndefined();
  });

  test("passes zero for missing deployless adapter factories", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, vaultV2QueryAbi, "query", vaultV2Result);

    const vault = await fetchVaultV2(VAULT, handle.client, {
      chainId: ChainId.LineaMainnet,
    });

    expect(vault.liquidityAllocations?.[0]?.allocation).toBe(100n);
  });

  test("uses multicall without liquidity allocations when no liquidity adapter is configured", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockVaultV2BaseReads(handle);
    mockRead(handle, {
      address: VAULT,
      abi: vaultV2Abi,
      functionName: "liquidityAdapter",
      result: zeroAddress,
    });
    mockRead(handle, {
      address: VAULT,
      abi: vaultV2Abi,
      functionName: "adaptersLength",
      result: 0n,
    });

    const vault = await fetchVaultV2(VAULT, handle.client, {
      chainId: CHAIN_ID,
    });

    expect(vault.adapters).toEqual([]);
    expect(vault.liquidityAllocations).toBeUndefined();
  });

  test("throws when a Vault V1 liquidity adapter has non-empty liquidity data", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockVaultV2BaseReads(handle);
    mockRead(handle, {
      address: VAULT,
      abi: vaultV2Abi,
      functionName: "liquidityData",
      result: "0x01",
    });
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: true,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: false,
    });

    await expect(
      fetchVaultV2(VAULT, handle.client, { chainId: CHAIN_ID }),
    ).rejects.toThrow(UnsupportedVaultV2AdapterError);
  });

  test("uses multicall and market-v1-adapter-v2 liquidity allocations", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockVaultV2BaseReads(handle);
    mockRead(handle, {
      address: VAULT,
      abi: vaultV2Abi,
      functionName: "liquidityData",
      result: MARKET_DATA,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: true,
    });
    mockVaultV2AllocationReads(handle, [
      VaultV2MorphoMarketV1AdapterV2.adapterId(ADAPTER),
      VaultV2MorphoMarketV1AdapterV2.collateralId(COLLATERAL),
      VaultV2MorphoMarketV1AdapterV2.marketParamsId(ADAPTER, MARKET_PARAMS),
    ]);

    const vault = await fetchVaultV2(VAULT, handle.client, {
      chainId: CHAIN_ID,
    });

    expect(vault.liquidityAllocations).toHaveLength(3);
  });

  test("throws typed unsupported adapter errors from deployless query reverts", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [contractRevert("UnsupportedVaultV2Adapter")]);

    await expect(
      fetchVaultV2(VAULT, handle.client, { chainId: CHAIN_ID }),
    ).rejects.toThrow(UnsupportedVaultV2AdapterError);
  });

  test("throws forced deployless failures", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);

    await expect(
      fetchVaultV2(VAULT, handle.client, {
        chainId: CHAIN_ID,
        deployless: "force",
      }),
    ).rejects.toThrow();
  });

  test("propagates deployless UnknownOfFactory reverts", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [contractRevert("UnknownOfFactory")]);

    await expect(
      fetchVaultV2(VAULT, handle.client, { chainId: CHAIN_ID }),
    ).rejects.toThrow("reverted");
  });

  test("throws UnknownOfFactory when the factory does not recognize the vault", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockTokenReads(handle);
    mockRead(handle, {
      address: ADDRESSES.vaultV2Factory,
      abi: vaultV2FactoryAbi,
      functionName: "isVaultV2",
      result: false,
    });
    for (const [functionName, result] of [
      ["asset", ASSET],
      ["totalSupply", 200n],
      ["_totalAssets", 100n],
      ["performanceFee", 5n],
      ["managementFee", 6n],
      ["virtualShares", 1n],
      ["lastUpdate", 4n],
      ["maxRate", 3n],
      ["liquidityAdapter", zeroAddress],
      ["liquidityData", "0x"],
      ["adaptersLength", 0n],
      ["performanceFeeRecipient", RECIPIENT],
      ["managementFeeRecipient", RECIPIENT],
    ] as const) {
      mockRead(handle, {
        address: VAULT,
        abi: vaultV2Abi,
        functionName,
        result,
      });
    }

    await expect(
      fetchVaultV2(VAULT, handle.client, { chainId: CHAIN_ID }),
    ).rejects.toThrow(UnknownOfFactory);
  });
});

describe("fetchVaultV2Adapter", () => {
  test("throws when the chain has no adapter factories", async () => {
    const { client } = createMockClient(mainnet);

    await expect(
      fetchVaultV2Adapter(ADAPTER, client, { chainId: ChainId.ZeroGMainnet }),
    ).rejects.toThrow(UnsupportedVaultV2AdapterError);
  });

  test("defaults parameters and catches factory read failures", async () => {
    const handle = createMockClient(mainnet);
    mockReadFailure(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
    });
    mockReadFailure(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
    });
    mockReadFailure(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
    });

    await expect(fetchVaultV2Adapter(ADAPTER, handle.client)).rejects.toThrow(
      UnsupportedVaultV2AdapterError,
    );
  });

  test("routes to the MorphoVaultV1 adapter fetcher", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: true,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: false,
    });
    mockDeploylessRead(handle, vaultAdapterQueryAbi, "query", {
      morphoVaultV1: VAULT,
      parentVault: RECIPIENT,
      skimRecipient: RECIPIENT,
    });

    const adapter = await fetchVaultV2Adapter(ADAPTER, handle.client, {
      chainId: CHAIN_ID,
    });

    expect(adapter).toBeInstanceOf(VaultV2MorphoVaultV1Adapter);
    expect((adapter as VaultV2MorphoVaultV1Adapter).morphoVaultV1).toBe(VAULT);
  });

  test("routes to the MorphoMarketV1 adapter fetcher", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      result: true,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: false,
    });
    mockDeploylessRead(handle, marketAdapterQueryAbi, "query", {
      parentVault: RECIPIENT,
      skimRecipient: RECIPIENT,
      marketParamsList: [marketQueryResult.marketParams],
    });

    const adapter = await fetchVaultV2Adapter(ADAPTER, handle.client, {
      chainId: CHAIN_ID,
    });

    expect(adapter).toBeInstanceOf(VaultV2MorphoMarketV1Adapter);
    expect(
      (adapter as VaultV2MorphoMarketV1Adapter).marketParamsList[0]?.id,
    ).toBe(ID);
  });

  test("routes to the MorphoMarketV1 adapter V2 fetcher", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: true,
    });
    mockDeploylessRead(handle, marketAdapterV2QueryAbi, "query", {
      parentVault: RECIPIENT,
      skimRecipient: RECIPIENT,
      adaptiveCurveIrm: ADDRESSES.adaptiveCurveIrm,
      marketSupplyShares: [{ marketId: ID, supplyShares: 99n }],
    });

    const adapter = await fetchVaultV2Adapter(ADAPTER, handle.client, {
      chainId: CHAIN_ID,
    });

    expect(adapter).toBeInstanceOf(VaultV2MorphoMarketV1AdapterV2);
    expect((adapter as VaultV2MorphoMarketV1AdapterV2).supplyShares[ID]).toBe(
      99n,
    );
  });

  test("throws when no known adapter factory recognizes the address", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: false,
    });

    await expect(
      fetchVaultV2Adapter(ADAPTER, handle.client, { chainId: CHAIN_ID }),
    ).rejects.toThrow(UnsupportedVaultV2AdapterError);
  });

  test("fetchAccrualVaultV2Adapter catches factory read failures", async () => {
    const handle = createMockClient(mainnet);
    mockReadFailure(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
    });
    mockReadFailure(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
    });
    mockReadFailure(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
    });

    await expect(
      fetchAccrualVaultV2Adapter(ADAPTER, handle.client, { chainId: CHAIN_ID }),
    ).rejects.toThrow(UnsupportedVaultV2AdapterError);
  });

  test("fetchAccrualVaultV2Adapter throws when the chain has no adapter factories", async () => {
    const { client } = createMockClient(mainnet);

    await expect(
      fetchAccrualVaultV2Adapter(ADAPTER, client, {
        chainId: ChainId.ZeroGMainnet,
      }),
    ).rejects.toThrow(UnsupportedVaultV2AdapterError);
  });
});

describe("individual adapter fetchers", () => {
  test("fetchVaultV2MorphoVaultV1Adapter throws UnknownFactory when no factory is configured", async () => {
    const { client } = createMockClient(mainnet);

    await expect(
      fetchVaultV2MorphoVaultV1Adapter(ADAPTER, client, {
        chainId: ChainId.CeloMainnet,
      }),
    ).rejects.toThrow(UnknownFactory);
  });

  test("fetchVaultV2MorphoMarketV1Adapter throws UnknownFactory when no factory is configured", async () => {
    const { client } = createMockClient(mainnet);

    await expect(
      fetchVaultV2MorphoMarketV1Adapter(ADAPTER, client, {
        chainId: ChainId.CeloMainnet,
      }),
    ).rejects.toThrow(UnknownFactory);
  });

  test("fetchVaultV2MorphoMarketV1AdapterV2 throws UnknownFactory when no factory is configured", async () => {
    const { client } = createMockClient(mainnet);

    await expect(
      fetchVaultV2MorphoMarketV1AdapterV2(ADAPTER, client, {
        chainId: ChainId.CeloMainnet,
      }),
    ).rejects.toThrow(UnknownFactory);
  });

  test("fetchVaultV2MorphoVaultV1Adapter throws when deployless is forced", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);

    await expect(
      fetchVaultV2MorphoVaultV1Adapter(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
        deployless: "force",
      }),
    ).rejects.toThrow();
  });

  test("fetchVaultV2MorphoVaultV1Adapter propagates deployless UnknownOfFactory reverts", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [contractRevert("UnknownOfFactory")]);

    await expect(
      fetchVaultV2MorphoVaultV1Adapter(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
      }),
    ).rejects.toThrow("reverted");
  });

  test("fetchVaultV2MorphoVaultV1Adapter uses multicall fallback", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: true,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "parentVault",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "skimRecipient",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "morphoVaultV1",
      result: VAULT,
    });

    const adapter = await fetchVaultV2MorphoVaultV1Adapter(
      ADAPTER,
      handle.client,
      { chainId: CHAIN_ID },
    );

    expect(adapter.morphoVaultV1).toBe(VAULT);
  });

  test("fetchVaultV2MorphoVaultV1Adapter uses multicall directly when deployless is disabled", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: true,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "parentVault",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "skimRecipient",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "morphoVaultV1",
      result: VAULT,
    });

    const adapter = await fetchVaultV2MorphoVaultV1Adapter(
      ADAPTER,
      handle.client,
      { deployless: false },
    );

    expect(adapter.morphoVaultV1).toBe(VAULT);
  });

  test("fetchVaultV2MorphoVaultV1Adapter throws UnknownOfFactory on multicall", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "parentVault",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "skimRecipient",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "morphoVaultV1",
      result: VAULT,
    });

    await expect(
      fetchVaultV2MorphoVaultV1Adapter(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
      }),
    ).rejects.toThrow(UnknownOfFactory);
  });

  test("fetchVaultV2MorphoVaultV1Adapter treats factory read failures as unknown factory membership", async () => {
    const handle = createMockClient(mainnet);
    mockReadFailure(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "parentVault",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "skimRecipient",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoVaultV1AdapterAbi,
      functionName: "morphoVaultV1",
      result: VAULT,
    });

    await expect(
      fetchVaultV2MorphoVaultV1Adapter(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
        deployless: false,
      }),
    ).rejects.toThrow(UnknownOfFactory);
  });

  test("fetchVaultV2MorphoMarketV1Adapter throws when deployless is forced", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);

    await expect(
      fetchVaultV2MorphoMarketV1Adapter(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
        deployless: "force",
      }),
    ).rejects.toThrow();
  });

  test("fetchVaultV2MorphoMarketV1Adapter propagates deployless UnknownOfFactory reverts", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [contractRevert("UnknownOfFactory")]);

    await expect(
      fetchVaultV2MorphoMarketV1Adapter(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
      }),
    ).rejects.toThrow("reverted");
  });

  test("fetchVaultV2MorphoMarketV1Adapter uses multicall fallback", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      result: true,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "parentVault",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "skimRecipient",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "marketParamsListLength",
      result: 1n,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "marketParamsList",
      result: marketQueryResult.marketParams,
    });

    const adapter = await fetchVaultV2MorphoMarketV1Adapter(
      ADAPTER,
      handle.client,
      { chainId: CHAIN_ID },
    );

    expect(adapter.marketParamsList[0]?.id).toBe(ID);
  });

  test("fetchVaultV2MorphoMarketV1Adapter uses multicall directly when deployless is disabled", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      result: true,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "parentVault",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "skimRecipient",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "marketParamsListLength",
      result: 1n,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "marketParamsList",
      result: marketQueryResult.marketParams,
    });

    const adapter = await fetchVaultV2MorphoMarketV1Adapter(
      ADAPTER,
      handle.client,
      { deployless: false },
    );

    expect(adapter.marketParamsList[0]?.id).toBe(ID);
  });

  test("fetchVaultV2MorphoMarketV1Adapter throws UnknownOfFactory on multicall", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "parentVault",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "skimRecipient",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "marketParamsListLength",
      result: 0n,
    });

    await expect(
      fetchVaultV2MorphoMarketV1Adapter(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
      }),
    ).rejects.toThrow(UnknownOfFactory);
  });

  test("fetchVaultV2MorphoMarketV1Adapter treats factory read failures as unknown factory membership", async () => {
    const handle = createMockClient(mainnet);
    mockReadFailure(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "parentVault",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "skimRecipient",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterAbi,
      functionName: "marketParamsListLength",
      result: 0n,
    });

    await expect(
      fetchVaultV2MorphoMarketV1Adapter(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
        deployless: false,
      }),
    ).rejects.toThrow(UnknownOfFactory);
  });

  test("fetchVaultV2MorphoMarketV1AdapterV2 throws when deployless is forced", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);

    await expect(
      fetchVaultV2MorphoMarketV1AdapterV2(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
        deployless: "force",
      }),
    ).rejects.toThrow();
  });

  test("fetchVaultV2MorphoMarketV1AdapterV2 propagates deployless UnknownOfFactory reverts", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [contractRevert("UnknownOfFactory")]);

    await expect(
      fetchVaultV2MorphoMarketV1AdapterV2(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
      }),
    ).rejects.toThrow("reverted");
  });

  test("fetchVaultV2MorphoMarketV1AdapterV2 uses multicall fallback", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: true,
    });
    for (const [functionName, result] of [
      ["parentVault", RECIPIENT],
      ["skimRecipient", RECIPIENT],
      ["marketIdsLength", 1n],
      ["adaptiveCurveIrm", ADDRESSES.adaptiveCurveIrm],
    ] as const) {
      mockRead(handle, {
        address: ADAPTER,
        abi: morphoMarketV1AdapterV2Abi,
        functionName,
        result,
      });
    }
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterV2Abi,
      functionName: "marketIds",
      result: ID,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterV2Abi,
      functionName: "supplyShares",
      result: 99n,
    });

    const adapter = await fetchVaultV2MorphoMarketV1AdapterV2(
      ADAPTER,
      handle.client,
      { chainId: CHAIN_ID },
    );

    expect(adapter.marketIds).toEqual([ID]);
    expect(adapter.supplyShares[ID]).toBe(99n);
  });

  test("fetchVaultV2MorphoMarketV1AdapterV2 uses multicall directly when deployless is disabled", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: true,
    });
    for (const [functionName, result] of [
      ["parentVault", RECIPIENT],
      ["skimRecipient", RECIPIENT],
      ["marketIdsLength", 1n],
      ["adaptiveCurveIrm", ADDRESSES.adaptiveCurveIrm],
    ] as const) {
      mockRead(handle, {
        address: ADAPTER,
        abi: morphoMarketV1AdapterV2Abi,
        functionName,
        result,
      });
    }
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterV2Abi,
      functionName: "marketIds",
      result: ID,
    });
    mockRead(handle, {
      address: ADAPTER,
      abi: morphoMarketV1AdapterV2Abi,
      functionName: "supplyShares",
      result: 99n,
    });

    const adapter = await fetchVaultV2MorphoMarketV1AdapterV2(
      ADAPTER,
      handle.client,
      { deployless: false },
    );

    expect(adapter.marketIds).toEqual([ID]);
    expect(adapter.supplyShares[ID]).toBe(99n);
  });

  test("fetchVaultV2MorphoMarketV1AdapterV2 throws UnknownOfFactory on multicall", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: false,
    });
    for (const [functionName, result] of [
      ["parentVault", RECIPIENT],
      ["skimRecipient", RECIPIENT],
      ["marketIdsLength", 0n],
      ["adaptiveCurveIrm", ADDRESSES.adaptiveCurveIrm],
    ] as const) {
      mockRead(handle, {
        address: ADAPTER,
        abi: morphoMarketV1AdapterV2Abi,
        functionName,
        result,
      });
    }

    await expect(
      fetchVaultV2MorphoMarketV1AdapterV2(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
      }),
    ).rejects.toThrow(UnknownOfFactory);
  });

  test("fetchVaultV2MorphoMarketV1AdapterV2 treats factory read failures as unknown factory membership", async () => {
    const handle = createMockClient(mainnet);
    mockReadFailure(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
    });
    for (const [functionName, result] of [
      ["parentVault", RECIPIENT],
      ["skimRecipient", RECIPIENT],
      ["marketIdsLength", 0n],
      ["adaptiveCurveIrm", ADDRESSES.adaptiveCurveIrm],
    ] as const) {
      mockRead(handle, {
        address: ADAPTER,
        abi: morphoMarketV1AdapterV2Abi,
        functionName,
        result,
      });
    }

    await expect(
      fetchVaultV2MorphoMarketV1AdapterV2(ADAPTER, handle.client, {
        chainId: CHAIN_ID,
        deployless: false,
      }),
    ).rejects.toThrow(UnknownOfFactory);
  });

  test("fetchAccrualVaultV2Adapter routes to the V2 accrual fetcher", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: true,
    });
    mockDeploylessReads(handle, [
      encodeReadResult(marketAdapterV2QueryAbi, "query", {
        parentVault: RECIPIENT,
        skimRecipient: RECIPIENT,
        adaptiveCurveIrm: ADDRESSES.adaptiveCurveIrm,
        marketSupplyShares: [{ marketId: ID, supplyShares: 99n }],
      }),
      encodeReadResult(marketQueryAbi, "query", marketQueryResult),
    ]);

    const adapter = await fetchAccrualVaultV2Adapter(ADAPTER, handle.client);

    expect(adapter).toBeInstanceOf(VaultV2MorphoMarketV1AdapterV2);
    expect(
      (adapter as AccrualVaultV2MorphoMarketV1AdapterV2).markets[0]?.id,
    ).toBe(ID);
  });

  test("fetchAccrualVaultV2Adapter routes to the market V1 accrual fetcher", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      result: true,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: false,
    });
    mockDeploylessReads(handle, [
      encodeReadResult(marketAdapterQueryAbi, "query", {
        parentVault: RECIPIENT,
        skimRecipient: RECIPIENT,
        marketParamsList: [marketQueryResult.marketParams],
      }),
      encodeReadResult(marketQueryAbi, "query", marketQueryResult),
    ]);
    mockRead(handle, {
      address: ADDRESSES.morpho,
      abi: blueAbi,
      functionName: "position",
      result: [11n, 12n, 13n],
    });

    const adapter = await fetchAccrualVaultV2Adapter(ADAPTER, handle.client, {
      chainId: CHAIN_ID,
    });

    expect(adapter).toBeInstanceOf(VaultV2MorphoMarketV1Adapter);
    expect(
      (adapter as AccrualVaultV2MorphoMarketV1Adapter).positions[0]?.marketId,
    ).toBe(ID);
  });

  test("fetchAccrualVaultV2Adapter routes to the Vault V1 accrual fetcher", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: true,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: false,
    });
    mockDeploylessReads(handle, [
      encodeReadResult(vaultAdapterQueryAbi, "query", {
        morphoVaultV1: VAULT,
        parentVault: RECIPIENT,
        skimRecipient: RECIPIENT,
      }),
      encodeReadResult(vaultQueryAbi, "query", {
        config: {
          asset: ASSET,
          symbol: "vMOCK",
          name: "Vault Mock",
          decimals: 18n,
          decimalsOffset: 2n,
          eip5267Domain: DOMAIN,
        },
        owner: RECIPIENT,
        curator: RECIPIENT,
        guardian: RECIPIENT,
        timelock: 1n,
        pendingTimelock: { value: 0n, validAt: 0n },
        pendingGuardian: { value: zeroAddress, validAt: 0n },
        pendingOwner: zeroAddress,
        fee: 0n,
        feeRecipient: RECIPIENT,
        skimRecipient: RECIPIENT,
        totalSupply: 10n,
        totalAssets: 11n,
        lastTotalAssets: 12n,
        supplyQueue: [],
        withdrawQueue: [],
        publicAllocatorConfig: {
          admin: zeroAddress,
          fee: 0n,
          accruedFee: 0n,
        },
      }),
    ]);
    mockRead(handle, {
      address: VAULT,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 99n,
    });

    const adapter = await fetchAccrualVaultV2Adapter(ADAPTER, handle.client, {
      chainId: CHAIN_ID,
    });

    expect(adapter).toBeInstanceOf(AccrualVaultV2MorphoVaultV1Adapter);
    expect((adapter as AccrualVaultV2MorphoVaultV1Adapter).shares).toBe(99n);
  });

  test("fetchAccrualVaultV2MorphoVaultV1Adapter composes the underlying Vault V1 accrual state", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [
      encodeReadResult(vaultAdapterQueryAbi, "query", {
        morphoVaultV1: VAULT,
        parentVault: RECIPIENT,
        skimRecipient: RECIPIENT,
      }),
      encodeReadResult(vaultQueryAbi, "query", {
        config: {
          asset: ASSET,
          symbol: "vMOCK",
          name: "Vault Mock",
          decimals: 18n,
          decimalsOffset: 2n,
          eip5267Domain: DOMAIN,
        },
        owner: RECIPIENT,
        curator: RECIPIENT,
        guardian: RECIPIENT,
        timelock: 1n,
        pendingTimelock: { value: 0n, validAt: 0n },
        pendingGuardian: { value: zeroAddress, validAt: 0n },
        pendingOwner: zeroAddress,
        fee: 0n,
        feeRecipient: RECIPIENT,
        skimRecipient: RECIPIENT,
        totalSupply: 10n,
        totalAssets: 11n,
        lastTotalAssets: 12n,
        supplyQueue: [],
        withdrawQueue: [],
        publicAllocatorConfig: {
          admin: zeroAddress,
          fee: 0n,
          accruedFee: 0n,
        },
      }),
    ]);
    mockRead(handle, {
      address: VAULT,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 99n,
    });

    const adapter = await fetchAccrualVaultV2MorphoVaultV1Adapter(
      ADAPTER,
      handle.client,
      { chainId: CHAIN_ID },
    );

    expect(adapter).toBeInstanceOf(AccrualVaultV2MorphoVaultV1Adapter);
    expect(adapter.accrualVaultV1.address).toBe(VAULT);
    expect(adapter.shares).toBe(99n);
  });
});

describe("fetchAccrualVaultV2", () => {
  test("fetches a deployless Vault V2 with asset balance", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, vaultV2QueryAbi, "query", {
      ...vaultV2Result,
      adapters: [],
      liquidityAdapter: zeroAddress,
      liquidityAllocations: [],
    });
    mockRead(handle, {
      address: ASSET,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 777n,
    });

    const vault = await fetchAccrualVaultV2(VAULT, handle.client);

    expect(vault.assetBalance).toBe(777n);
    expect(vault.accrualLiquidityAdapter).toBeUndefined();
    expect(vault.accrualAdapters).toEqual([]);
  });

  test("fetches accrual adapters and force-deallocate penalties", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [
      encodeReadResult(vaultV2QueryAbi, "query", {
        ...vaultV2Result,
        liquidityAdapter: ADAPTER,
        adapters: [ADAPTER_2],
        liquidityAllocations: [],
      }),
      encodeReadResult(marketAdapterV2QueryAbi, "query", {
        parentVault: RECIPIENT,
        skimRecipient: RECIPIENT,
        adaptiveCurveIrm: ADDRESSES.adaptiveCurveIrm,
        marketSupplyShares: [{ marketId: ID, supplyShares: 99n }],
      }),
      encodeReadResult(marketAdapterV2QueryAbi, "query", {
        parentVault: RECIPIENT,
        skimRecipient: RECIPIENT,
        adaptiveCurveIrm: ADDRESSES.adaptiveCurveIrm,
        marketSupplyShares: [{ marketId: ID, supplyShares: 88n }],
      }),
      encodeReadResult(marketQueryAbi, "query", marketQueryResult),
      encodeReadResult(marketQueryAbi, "query", marketQueryResult),
    ]);
    mockRead(handle, {
      address: ASSET,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 777n,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoVaultV1AdapterFactory,
      abi: morphoVaultV1AdapterFactoryAbi,
      functionName: "isMorphoVaultV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "isMorphoMarketV1AdapterV2",
      result: true,
    });
    mockRead(handle, {
      address: VAULT,
      abi: vaultV2Abi,
      functionName: "forceDeallocatePenalty",
      result: 12n,
    });

    const vault = await fetchAccrualVaultV2(VAULT, handle.client, {
      chainId: CHAIN_ID,
    });

    expect(vault.accrualLiquidityAdapter?.address).toBe(ADAPTER);
    expect(vault.accrualAdapters[0]?.address).toBe(ADAPTER_2);
    expect(vault.forceDeallocatePenalties[ADAPTER_2]).toBe(12n);
  });
});
