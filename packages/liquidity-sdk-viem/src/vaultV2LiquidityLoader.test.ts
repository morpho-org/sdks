import {
  AdaptiveCurveIrmLib,
  getChainAddresses,
  Market,
  MarketParams,
  MathLib,
  VaultV2MorphoMarketV1AdapterV2,
} from "@morpho-org/blue-sdk";
import { BLUE_API_BASE_URL } from "@morpho-org/morpho-ts";
import {
  vaultV2Abi,
  vaultV2BluePublicAllocatorAbi,
} from "@morpho-org/morpho-ts/abis";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import nock from "nock";
import { type Address, type Hex, toHex, zeroAddress, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { beforeEach, describe, expect, test } from "vitest";
import { fetchRestVaultV2 } from "./api/rest.js";
import {
  InconsistentVaultV2LiquiditySnapshotError,
  InvalidVaultV2LiquidityApiResponseError,
  MissingVaultV2LiquidityApiDataError,
  VaultV2LiquidityApiError,
} from "./errors.js";
import { VaultV2LiquidityLoader } from "./vaultV2LiquidityLoader.js";

const BLOCK_NUMBER = 10n;
const BLOCK_TIMESTAMP = 1_700_000_000n;
const ORACLE_PRICE = 10n ** 36n;
const ALLOCATOR: Address = "0x0000000000000000000000000000000000000001";
const VAULT: Address = "0x0000000000000000000000000000000000000002";
const ADAPTER: Address = "0x0000000000000000000000000000000000000003";
const ASSET: Address = "0x0000000000000000000000000000000000000004";
const COLLATERAL: Address = "0x0000000000000000000000000000000000000006";
const ORACLE: Address = "0x0000000000000000000000000000000000000007";
const IRM = getChainAddresses(mainnet.id).adaptiveCurveIrm;

const marketParams = new MarketParams({
  loanToken: ASSET,
  collateralToken: COLLATERAL,
  oracle: ORACLE,
  irm: IRM,
  lltv: 860_000_000_000_000_000n,
});
const ids = [
  VaultV2MorphoMarketV1AdapterV2.adapterId(ADAPTER),
  VaultV2MorphoMarketV1AdapterV2.collateralId(COLLATERAL),
  VaultV2MorphoMarketV1AdapterV2.marketParamsId(ADAPTER, marketParams),
] as const;
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

const vaultConfigResponse = {
  data: {
    chain_id: mainnet.id,
    address: VAULT,
    last_indexed_block: BLOCK_NUMBER.toString(),
    version: "2.0",
    name: "Vault V2",
    symbol: "v2",
    asset: { address: ASSET, decimals: 18, name: "Asset", symbol: "AST" },
    decimals_offset: 0,
    factory_address: zeroAddress,
    creation_block_number: "1",
    owner: zeroAddress,
    curator: zeroAddress,
    timelock_seconds: 0,
    management_fee_wad: null,
    management_fee_recipient: null,
    performance_fee_wad: null,
    performance_fee_recipient: null,
    max_rate_per_second_wad: "0",
    adapter_registry: zeroAddress,
    liquidity_adapter: zeroAddress,
    liquidity_data: "0x" as Hex,
    gates: {
      send_shares: null,
      receive_shares: null,
      send_assets: null,
      receive_assets: null,
    },
  },
};

const defaultMarketState = {
  lastAccrualTimestamp: BLOCK_TIMESTAMP,
  totalSupplyAssets: 100n,
  totalSupplyShares: 100_000_000n,
  totalBorrowAssets: 95n,
  totalBorrowShares: 95_000_000n,
  fee: 0n,
};

const setupApi = ({
  vaultStatus = 200,
  includePenalty = true,
  marketStateBlock = BLOCK_NUMBER,
  marketState = {},
  positionUser = ADAPTER,
  positionSupplyShares = 0n,
  rateAtTarget = 0n,
}: {
  readonly vaultStatus?: number;
  readonly includePenalty?: boolean;
  readonly marketStateBlock?: bigint;
  readonly marketState?: Partial<typeof defaultMarketState>;
  readonly positionUser?: Address;
  readonly positionSupplyShares?: bigint;
  readonly rateAtTarget?: bigint;
} = {}) => {
  const resolvedMarketState = { ...defaultMarketState, ...marketState };
  const rest = nock(BLUE_API_BASE_URL);
  rest
    .get(`/v0/vaults-v2/${mainnet.id}:${VAULT}`)
    .reply(vaultStatus, vaultConfigResponse);
  rest.get(`/v1/vaults-v2/${mainnet.id}:${VAULT}/state`).reply(200, {
    data: {
      chain_id: mainnet.id,
      address: VAULT,
      last_indexed_block: BLOCK_NUMBER.toString(),
      last_accrual_timestamp: Number(BLOCK_TIMESTAMP),
      total_assets: "100",
      total_supply: "100",
      withdrawable_assets: "100",
      allocated_assets: "0",
      idle_assets: "100",
      share_price_ray: "1000000000000000000000000000",
    },
  });
  rest.get(`/v0/vaults-v2/${mainnet.id}:${VAULT}/allocations`).reply(200, {
    data: {
      chain_id: mainnet.id,
      vault_address: VAULT,
      last_indexed_block: BLOCK_NUMBER.toString(),
      allocations: [
        {
          adapter_address: ADAPTER,
          adapter_kind: "morpho_market_v1_v2",
          caps: [
            {
              cap_id: ids[2],
              cap_data: "0x",
              allocated_assets: "0",
              absolute_cap: "1000",
              relative_cap_wad: MathLib.WAD.toString(),
              cap_type: "market_v1",
              market_id: marketParams.id,
            },
          ],
        },
      ],
      unscoped_caps: [],
    },
  });
  rest
    .get(`/v0/vaults-v2/${mainnet.id}:${VAULT}/withdrawal-options`)
    .reply(200, {
      data: {
        chain_id: mainnet.id,
        vault_address: VAULT,
        liquidity_adapter_available_assets: "0",
        idle_assets: "100",
        adapter_penalties: includePenalty
          ? [
              {
                adapter_address: ADAPTER,
                adapter_kind: "blue_market_adapter",
                force_deallocatable_assets: "0",
                penalty_rate_wad: "0",
              },
            ]
          : [],
      },
    });
  rest.get(`/v0/blue/markets/${mainnet.id}:${marketParams.id}`).reply(200, {
    data: {
      chain_id: mainnet.id,
      market_id: marketParams.id,
      loan_token: ASSET,
      collateral_token: COLLATERAL,
      oracle_address: ORACLE,
      irm_address: IRM,
      lltv_wad: marketParams.lltv.toString(),
      creation_block_number: "1",
    },
  });
  rest
    .get(`/v0/blue/markets/${mainnet.id}:${marketParams.id}/state`)
    .reply(200, {
      data: {
        chain_id: mainnet.id,
        market_id: marketParams.id,
        last_indexed_block: marketStateBlock.toString(),
        last_accrual_timestamp: Number(
          resolvedMarketState.lastAccrualTimestamp,
        ),
        total_supply_assets: resolvedMarketState.totalSupplyAssets.toString(),
        total_supply_shares: resolvedMarketState.totalSupplyShares.toString(),
        total_borrow_assets: resolvedMarketState.totalBorrowAssets.toString(),
        total_borrow_shares: resolvedMarketState.totalBorrowShares.toString(),
        fee_wad: resolvedMarketState.fee.toString(),
      },
    });

  rest
    .get(
      `/v0/blue/markets/${mainnet.id}:${marketParams.id}/users/${ADAPTER}/position`,
    )
    .reply(200, {
      data: {
        chain_id: mainnet.id,
        market_id: marketParams.id,
        user_address: positionUser,
        last_indexed_block: BLOCK_NUMBER.toString(),
        collateral_assets: "0",
        supply_shares: positionSupplyShares.toString(),
        borrow_shares: "0",
      },
    });
  rest.get(`/v0/oracles/${mainnet.id}:${ORACLE}/state`).reply(200, {
    data: {
      chain_id: mainnet.id,
      oracle_address: ORACLE,
      last_indexed_block: BLOCK_NUMBER.toString(),
      last_updated_at: BLOCK_TIMESTAMP.toString(),
      price: ORACLE_PRICE.toString(),
    },
  });
  rest
    .get(`/consumer/chains/${mainnet.id}/markets/${marketParams.id}/irm`)
    .reply(200, {
      chainId: mainnet.id,
      marketId: marketParams.id,
      irmAddress: IRM,
      targetUtilization: 0.9,
      utilization: 0.95,
      apyAtTarget: 0,
      rateAtTarget: rateAtTarget.toString(),
      borrowToTarget: 0,
    });

  return rest;
};

const setupClient = () => {
  const handle = createMockClient(mainnet);
  const defaultRequest = handle.request.getMockImplementation();
  handle.request.mockImplementation(async (call) => {
    const { method } = call;
    if (method === "eth_getBlockByNumber") return rpcBlock();
    return defaultRequest?.(call);
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
    result: 1_000n,
  });
  mockRead(handle, {
    address: ALLOCATOR,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "canPullFromMarket",
    result: false,
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
    result: 0n,
  });
  return handle;
};

describe.sequential("VaultV2LiquidityLoader", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  test("default: hydrates Vault V2 data from REST", async () => {
    const api = setupApi();
    const { client } = setupClient();
    const loader = new VaultV2LiquidityLoader(client, {
      allocator: ALLOCATOR,
      vaults: [VAULT],
      deployless: false,
    });

    const result = await loader.fetch(marketParams.id);

    expect(result.reallocations).toStrictEqual([
      {
        allocator: ALLOCATOR,
        type: "bluePublicAllocator",
        vault: VAULT,
        from: { type: "idle" },
        to: { adapter: ADAPTER },
        assets: 100n,
        penalty: 12n,
      },
    ]);
    expect(result.endState.getMarket(marketParams.id).totalSupplyAssets).toBe(
      200n,
    );
    expect(result.startState.getMarket(marketParams.id)).toMatchObject({
      price: ORACLE_PRICE,
      rateAtTarget: 0n,
    });
    expect(
      result.startState.getAdapter(VAULT, ADAPTER).supplyShares[
        marketParams.id
      ],
    ).toBe(0n);
    expect(
      result.startState.getVault(VAULT).forceDeallocatePenalties[ADAPTER],
    ).toBe(0n);
    expect(result.targetBorrowUtilization).toBe(900_000_000_000_000_000n);
    api.done();
  });

  test("behavior: accrues REST-projected market totals only after the indexed block", async () => {
    const storedTimestamp = BLOCK_TIMESTAMP - 3_600n;
    const positionSupplyShares = 500_000_000_000_000_000_000_000_000n;
    // Mirrors the raw market tuple and stored IRM value returned by pinned RPC.
    const rawRpcMarket = new Market({
      params: marketParams,
      totalSupplyAssets: 1_000_000_000_000_000_000_000n,
      totalSupplyShares: 1_000_000_000_000_000_000_000_000_000n,
      totalBorrowAssets: 950_000_000_000_000_000_000n,
      totalBorrowShares: 950_000_000_000_000_000_000_000_000n,
      lastUpdate: storedTimestamp,
      fee: 0n,
      price: ORACLE_PRICE,
      rateAtTarget: AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET,
    });
    const indexedMarket = rawRpcMarket.accrueInterest(BLOCK_TIMESTAMP);
    expect(indexedMarket.totalBorrowAssets).toBeGreaterThan(
      rawRpcMarket.totalBorrowAssets,
    );

    const api = setupApi({
      marketState: {
        lastAccrualTimestamp: storedTimestamp,
        totalSupplyAssets: indexedMarket.totalSupplyAssets,
        totalSupplyShares: indexedMarket.totalSupplyShares,
        totalBorrowAssets: indexedMarket.totalBorrowAssets,
        totalBorrowShares: indexedMarket.totalBorrowShares,
        fee: indexedMarket.fee,
      },
      positionSupplyShares,
      rateAtTarget: indexedMarket.rateAtTarget,
    });
    const { client } = setupClient();
    const loader = new VaultV2LiquidityLoader(client, {
      allocator: ALLOCATOR,
      vaults: [VAULT],
      deployless: false,
    });

    const result = await loader.fetch(marketParams.id);
    const executionTimestamp = BLOCK_TIMESTAMP + 3_600n;
    const expectedMarket = indexedMarket.accrueInterest(executionTimestamp);
    const hydratedMarket = result.startState.getMarket(marketParams.id);

    expect(hydratedMarket.lastUpdate).toBe(BLOCK_TIMESTAMP);
    expect(hydratedMarket.accrueInterest(executionTimestamp)).toStrictEqual(
      expectedMarket,
    );
    expect(
      result.startState
        .getAdapter(VAULT, ADAPTER)
        .realAssets(executionTimestamp),
    ).toBe(expectedMarket.toSupplyAssets(positionSupplyShares));
    api.done();
  });

  test("behavior: filters vaults above the maximum penalty", async () => {
    const api = setupApi();
    const { client } = setupClient();
    const loader = new VaultV2LiquidityLoader(client, {
      allocator: ALLOCATOR,
      vaults: [VAULT],
      maxPenalty: 11n,
      deployless: false,
    });

    await expect(loader.fetch(marketParams.id)).resolves.toMatchObject({
      reallocations: [],
    });
    api.done();
  });

  test("error: VaultV2LiquidityApiError", async () => {
    setupApi({ vaultStatus: 503 });
    const { client } = setupClient();
    const loader = new VaultV2LiquidityLoader(client, {
      allocator: ALLOCATOR,
      vaults: [VAULT],
    });

    await expect(loader.fetch(marketParams.id)).rejects.toBeInstanceOf(
      VaultV2LiquidityApiError,
    );
  });

  test("error: VaultV2LiquidityApiError wraps network failures", async () => {
    const api = nock(BLUE_API_BASE_URL)
      .get(`/v0/vaults-v2/${mainnet.id}:${VAULT}`)
      .replyWithError("network unavailable");

    await expect(fetchRestVaultV2(mainnet.id, VAULT)).rejects.toMatchObject({
      name: "VaultV2LiquidityApiError",
      status: undefined,
      cause: expect.anything(),
    });
    api.done();
  });

  test("error: MissingVaultV2LiquidityApiDataError", async () => {
    setupApi({ includePenalty: false });
    const { client } = setupClient();
    const loader = new VaultV2LiquidityLoader(client, {
      allocator: ALLOCATOR,
      vaults: [VAULT],
    });

    await expect(loader.fetch(marketParams.id)).rejects.toBeInstanceOf(
      MissingVaultV2LiquidityApiDataError,
    );
  });

  test("error: InvalidVaultV2LiquidityApiResponseError", async () => {
    const api = nock(BLUE_API_BASE_URL)
      .get(`/v0/vaults-v2/${mainnet.id}:${VAULT}`)
      .reply(200, { data: { chain_id: mainnet.id, address: VAULT } });

    await expect(fetchRestVaultV2(mainnet.id, VAULT)).rejects.toBeInstanceOf(
      InvalidVaultV2LiquidityApiResponseError,
    );
    api.done();
  });

  test("error: InconsistentVaultV2LiquiditySnapshotError", async () => {
    setupApi({ marketStateBlock: BLOCK_NUMBER + 1n });
    const { client } = setupClient();
    const loader = new VaultV2LiquidityLoader(client, {
      allocator: ALLOCATOR,
      vaults: [VAULT],
    });

    await expect(loader.fetch(marketParams.id)).rejects.toBeInstanceOf(
      InconsistentVaultV2LiquiditySnapshotError,
    );
  });

  test("error: mismatched adapter-market position is rejected", async () => {
    setupApi({
      positionUser: "0x0000000000000000000000000000000000000005",
    });
    const { client } = setupClient();
    const loader = new VaultV2LiquidityLoader(client, {
      allocator: ALLOCATOR,
      vaults: [VAULT],
    });

    await expect(loader.fetch(marketParams.id)).rejects.toBeInstanceOf(
      InvalidVaultV2LiquidityApiResponseError,
    );
  });
});
