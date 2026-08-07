import {
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  Market,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import { type Address, type Hex, toHex, zeroAddress, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  fetchAccrualVaultV2Mock,
  fetchMarketMock,
  fetchVaultV2PublicAllocatorDataMock,
} = vi.hoisted(() => ({
  fetchAccrualVaultV2Mock: vi.fn(),
  fetchMarketMock: vi.fn(),
  fetchVaultV2PublicAllocatorDataMock: vi.fn(),
}));

vi.mock("@morpho-org/blue-sdk-viem", () => ({
  fetchAccrualVaultV2: fetchAccrualVaultV2Mock,
  fetchMarket: fetchMarketMock,
  fetchVaultV2PublicAllocatorData: fetchVaultV2PublicAllocatorDataMock,
}));

const { VaultV2LiquidityLoader } = await import("./vaultV2LiquidityLoader.js");

const BLOCK_NUMBER = 10n;
const BLOCK_TIMESTAMP = 1_700_000_000n;
const ALLOCATOR: Address = "0x0000000000000000000000000000000000000001";
const VAULT: Address = "0x0000000000000000000000000000000000000002";
const ADAPTER: Address = "0x0000000000000000000000000000000000000003";
const ASSET: Address = "0x0000000000000000000000000000000000000004";
const IRM: Address = "0x0000000000000000000000000000000000000005";

const marketParams = new MarketParams({
  loanToken: ASSET,
  collateralToken: "0x0000000000000000000000000000000000000006",
  oracle: zeroAddress,
  irm: IRM,
  lltv: 860_000_000_000_000_000n,
});
const market = new Market({
  params: marketParams,
  totalSupplyAssets: 100n,
  totalBorrowAssets: 95n,
  totalSupplyShares: 100_000_000n,
  totalBorrowShares: 95_000_000n,
  lastUpdate: BLOCK_TIMESTAMP,
  fee: 0n,
});
const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
  {
    address: ADAPTER,
    parentVault: VAULT,
    skimRecipient: zeroAddress,
    marketIds: [market.id],
    adaptiveCurveIrm: IRM,
    supplyShares: { [market.id]: 0n },
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
    lastUpdate: BLOCK_TIMESTAMP,
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
  100n,
  {},
);
const ids = adapter.ids(market.params);
const allocatorData = {
  publicAllocatorConfig: {
    allocator: ALLOCATOR,
    vault: VAULT,
    canAllocateFromIdle: true,
    nativePenalty: 12n,
  },
  marketPublicAllocatorConfigs: {
    [ids[2]]: {
      allocator: ALLOCATOR,
      vault: VAULT,
      adapter: ADAPTER,
      marketParamsId: ids[2],
      absoluteCap: 1_000n,
      canDeallocate: false,
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
        allocation: 0n,
      },
    ]),
  ),
};

const rpcBlock = () => ({
  baseFeePerGas: toHex(0n),
  difficulty: toHex(0n),
  extraData: "0x",
  gasLimit: toHex(30_000_000n),
  gasUsed: toHex(0n),
  hash: zeroHash,
  logsBloom: `0x${"00".repeat(256)}` as Hex,
  miner: zeroAddress,
  mixHash: zeroHash,
  nonce: "0x0000000000000000",
  number: toHex(BLOCK_NUMBER),
  parentHash: zeroHash,
  receiptsRoot: zeroHash,
  sha3Uncles: zeroHash,
  size: toHex(0n),
  stateRoot: zeroHash,
  timestamp: toHex(BLOCK_TIMESTAMP),
  totalDifficulty: toHex(0n),
  transactions: [],
  transactionsRoot: zeroHash,
  uncles: [],
});

const setup = () => {
  const handle = createMockClient(mainnet);
  handle.request.mockImplementation(async ({ method }) => {
    if (method === "eth_getBlockByNumber") return rpcBlock();
    if (method === "eth_chainId") return toHex(mainnet.id);
    throw new Error(`Unexpected RPC method: ${method}`);
  });
  fetchMarketMock.mockResolvedValue(market);
  fetchAccrualVaultV2Mock.mockResolvedValue(vault);
  fetchVaultV2PublicAllocatorDataMock.mockResolvedValue(allocatorData);
  return handle;
};

describe("VaultV2LiquidityLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("default: returns action-ready Vault V2 reallocations", async () => {
    const { client } = setup();
    const loader = new VaultV2LiquidityLoader(client, {
      allocator: ALLOCATOR,
      vaults: [VAULT],
    });

    const result = await loader.fetch(market.id);

    expect(result.reallocations).toStrictEqual([
      {
        allocator: ALLOCATOR,
        type: "bluePublicAllocator",
        vault: VAULT,
        from: { type: "idle" },
        to: { adapter: ADAPTER },
        assets: 100n,
        nativePenalty: 12n,
      },
    ]);
    expect(result.endState.getMarket(market.id).totalSupplyAssets).toBe(200n);
    expect(result.targetBorrowUtilization).toBe(900_000_000_000_000_000n);
    expect(fetchMarketMock).toHaveBeenCalledWith(market.id, client, {
      blockNumber: BLOCK_NUMBER,
      chainId: mainnet.id,
    });
    expect(fetchAccrualVaultV2Mock).toHaveBeenCalledWith(VAULT, client, {
      blockNumber: BLOCK_NUMBER,
      chainId: mainnet.id,
      deployless: undefined,
    });
    expect(fetchVaultV2PublicAllocatorDataMock).toHaveBeenCalledWith(
      ALLOCATOR,
      vault,
      client,
      { blockNumber: BLOCK_NUMBER, deployless: undefined },
    );
  });

  test("behavior: filters vaults above the maximum native penalty", async () => {
    const { client } = setup();
    const loader = new VaultV2LiquidityLoader(client, {
      allocator: ALLOCATOR,
      vaults: [VAULT],
      maxNativePenalty: 11n,
      deployless: "force",
    });

    await expect(loader.fetch(market.id)).resolves.toMatchObject({
      reallocations: [],
    });
    expect(fetchAccrualVaultV2Mock).toHaveBeenCalledWith(VAULT, client, {
      blockNumber: BLOCK_NUMBER,
      chainId: mainnet.id,
      deployless: "force",
    });
  });
});
