import {
  ChainId,
  getChainAddresses,
  type MarketId,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  metaMorphoAbi,
  metaMorphoFactoryAbi,
  publicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";
import { createMockClient, type MockClientHandle } from "@morpho-org/test/mock";
import nock from "nock";
import {
  type Abi,
  type Address,
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, test } from "vitest";
import { LiquidityLoader } from "./loader.js";

const { morpho, publicAllocator, metaMorphoFactory } = getChainAddresses(
  ChainId.EthMainnet,
);

if (publicAllocator == null || metaMorphoFactory == null) {
  throw new Error(
    "Ethereum mainnet addresses must include allocator contracts",
  );
}

const vault = "0x0000000000000000000000000000000000000aaa";
const loanToken = "0x0000000000000000000000000000000000000101";
const targetCollateralToken = "0x0000000000000000000000000000000000000202";
const sourceCollateralToken = "0x0000000000000000000000000000000000000303";
const owner = "0x0000000000000000000000000000000000000bBB";

const targetMarketParams = new MarketParams({
  loanToken,
  collateralToken: targetCollateralToken,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 860000000000000000n,
});
const sourceMarketParams = new MarketParams({
  loanToken,
  collateralToken: sourceCollateralToken,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 860000000000000000n,
});
const targetMarketId = targetMarketParams.id;
const sourceMarketId = sourceMarketParams.id;
const sourceSupplyShares = 1_000_000_000n;

type ContractRead = {
  readonly address: Address;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args?: readonly unknown[];
  readonly result: unknown;
};

type LoaderMockOptions = {
  readonly blockNumber?: bigint;
  readonly blockTimestamp: bigint;
  readonly targetPendingCapValue?: bigint;
  readonly targetPendingCapValidAt?: bigint;
  readonly sourceBorrowAssets?: bigint;
};

type AbiFunctionItem = Extract<Abi[number], { readonly type: "function" }>;

const normalize = (value: unknown): unknown => {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value.toLowerCase();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object" && value != null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalize(nested)]),
    );

  return value;
};

const sameArgs = (
  actual: readonly unknown[] | undefined,
  expected: readonly unknown[] | undefined,
) =>
  JSON.stringify(normalize(actual ?? [])) ===
  JSON.stringify(normalize(expected ?? []));

const encodeReadResult = ({ abi, functionName, result }: ContractRead): Hex => {
  const fnItems = abi.filter(
    (item): item is AbiFunctionItem =>
      item.type === "function" && item.name === functionName,
  );

  for (const item of fnItems) {
    try {
      return encodeFunctionResult({
        abi: [item],
        functionName: item.name,
        result,
      } as Parameters<typeof encodeFunctionResult>[0]);
    } catch {
      // Try the next overload; the result only has to match the one used.
    }
  }

  throw new Error(`No ABI overload matched ${functionName}`);
};

const rpcBlock = (number: bigint, timestamp: bigint) => ({
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
  number: toHex(number),
  parentHash: zeroHash,
  receiptsRoot: zeroHash,
  sha3Uncles: zeroHash,
  size: toHex(0n),
  stateRoot: zeroHash,
  timestamp: toHex(timestamp),
  totalDifficulty: toHex(0n),
  transactions: [],
  transactionsRoot: zeroHash,
  uncles: [],
});

const marketParamsResult = (params: MarketParams) => [
  params.loanToken,
  params.collateralToken,
  params.oracle,
  params.irm,
  params.lltv,
];

const setupLoaderMockClient = ({
  blockNumber = 10n,
  blockTimestamp,
  targetPendingCapValue = 100n,
  targetPendingCapValidAt = 110n,
  sourceBorrowAssets = 0n,
}: LoaderMockOptions): MockClientHandle<typeof mainnet> => {
  const handle = createMockClient(mainnet);
  const reads: ContractRead[] = [];
  const addRead = (read: ContractRead) => reads.push(read);

  addRead({
    address: morpho,
    abi: blueAbi,
    functionName: "idToMarketParams",
    args: [targetMarketId],
    result: marketParamsResult(targetMarketParams),
  });
  addRead({
    address: morpho,
    abi: blueAbi,
    functionName: "idToMarketParams",
    args: [sourceMarketId],
    result: marketParamsResult(sourceMarketParams),
  });
  addRead({
    address: morpho,
    abi: blueAbi,
    functionName: "market",
    args: [targetMarketId],
    result: [0n, 0n, 0n, 0n, blockTimestamp, 0n],
  });
  addRead({
    address: morpho,
    abi: blueAbi,
    functionName: "market",
    args: [sourceMarketId],
    result: [
      1000n,
      sourceSupplyShares,
      sourceBorrowAssets,
      sourceBorrowAssets,
      blockTimestamp,
      0n,
    ],
  });
  addRead({
    address: morpho,
    abi: blueAbi,
    functionName: "position",
    args: [targetMarketId, vault],
    result: [0n, 0n, 0n],
  });
  addRead({
    address: morpho,
    abi: blueAbi,
    functionName: "position",
    args: [sourceMarketId, vault],
    result: [sourceSupplyShares, 0n, 0n],
  });

  addRead({
    address: vault,
    abi: erc20Abi,
    functionName: "decimals",
    result: 18,
  });
  addRead({
    address: vault,
    abi: erc20Abi,
    functionName: "symbol",
    result: "mvTEST",
  });
  addRead({
    address: vault,
    abi: erc20Abi,
    functionName: "name",
    result: "MetaMorpho Test",
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "asset",
    result: loanToken,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "DECIMALS_OFFSET",
    result: 0,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "curator",
    result: owner,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "owner",
    result: owner,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "guardian",
    result: owner,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "timelock",
    result: 0n,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "pendingTimelock",
    result: [0n, 0n],
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "pendingGuardian",
    result: [zeroAddress, 0n],
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "pendingOwner",
    result: zeroAddress,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "fee",
    result: 0n,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "feeRecipient",
    result: owner,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "skimRecipient",
    result: owner,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "totalSupply",
    result: 1000n,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "totalAssets",
    result: 1000n,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "lastTotalAssets",
    result: 1000n,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "supplyQueueLength",
    result: 2n,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "withdrawQueueLength",
    result: 2n,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "isAllocator",
    args: [publicAllocator],
    result: true,
  });
  addRead({
    address: metaMorphoFactory,
    abi: metaMorphoFactoryAbi as Abi,
    functionName: "isMetaMorpho",
    args: [vault],
    result: true,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "supplyQueue",
    args: [0n],
    result: targetMarketId,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "supplyQueue",
    args: [1n],
    result: sourceMarketId,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "withdrawQueue",
    args: [0n],
    result: sourceMarketId,
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "withdrawQueue",
    args: [1n],
    result: targetMarketId,
  });

  addRead({
    address: publicAllocator,
    abi: publicAllocatorAbi,
    functionName: "admin",
    args: [vault],
    result: owner,
  });
  addRead({
    address: publicAllocator,
    abi: publicAllocatorAbi,
    functionName: "fee",
    args: [vault],
    result: 0n,
  });
  addRead({
    address: publicAllocator,
    abi: publicAllocatorAbi,
    functionName: "accruedFee",
    args: [vault],
    result: 0n,
  });

  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "config",
    args: [targetMarketId],
    result: [10_000n, true, 0n],
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "pendingCap",
    args: [targetMarketId],
    result: [targetPendingCapValue, targetPendingCapValidAt],
  });
  addRead({
    address: publicAllocator,
    abi: publicAllocatorAbi,
    functionName: "flowCaps",
    args: [vault, targetMarketId],
    result: [10_000n, 0n],
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "config",
    args: [sourceMarketId],
    result: [10_000n, true, 0n],
  });
  addRead({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "pendingCap",
    args: [sourceMarketId],
    result: [10_000n, 0n],
  });
  addRead({
    address: publicAllocator,
    abi: publicAllocatorAbi,
    functionName: "flowCaps",
    args: [vault, sourceMarketId],
    result: [0n, 10_000n],
  });

  handle.request.mockImplementation(async ({ method, params }) => {
    if (method === "eth_chainId") return toHex(mainnet.id);
    if (method === "eth_getBlockByNumber")
      return rpcBlock(blockNumber, blockTimestamp);
    if (method === "eth_call") {
      const [tx] = (params ?? []) as readonly [
        { readonly to?: Address; readonly data?: Hex },
        ...unknown[],
      ];

      if (typeof tx?.to === "string" && typeof tx.data === "string") {
        for (const read of reads) {
          if (read.address.toLowerCase() !== tx.to.toLowerCase()) continue;

          try {
            const decoded = decodeFunctionData({
              abi: read.abi,
              data: tx.data,
            });

            if (decoded.functionName !== read.functionName) continue;
            if (!sameArgs(decoded.args, read.args)) continue;

            return encodeReadResult(read);
          } catch {
            // Different ABI/function selector; keep looking.
          }
        }
      }
    }

    throw new Error(
      `[loader.test] unhandled RPC ${method} ${JSON.stringify(normalize(params))}`,
    );
  });

  return handle;
};

const mockApiMarkets = (
  sourceTargetWithdrawUtilization = MathLib.WAD,
  items: readonly Record<string, unknown>[] = [
    {
      uniqueKey: targetMarketId,
      targetBorrowUtilization: "900000000000000000",
      publicAllocatorSharedLiquidity: [],
      supplyingVaults: [
        {
          address: vault,
          state: {
            allocation: [
              {
                market: {
                  uniqueKey: targetMarketId,
                  loanAsset: { address: loanToken },
                  targetWithdrawUtilization: MathLib.WAD.toString(),
                },
              },
              {
                market: {
                  uniqueKey: sourceMarketId,
                  loanAsset: { address: loanToken },
                  targetWithdrawUtilization:
                    sourceTargetWithdrawUtilization.toString(),
                },
              },
            ],
          },
        },
      ],
    },
  ],
) =>
  nock(new URL(BLUE_API_GRAPHQL_URL).origin)
    .post("/graphql")
    .reply(200, { data: { markets: { items } } });

const getBlockCalls = (handle: MockClientHandle<typeof mainnet>) =>
  handle.request.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "eth_getBlockByNumber");

describe("LiquidityLoader (constructor + public API)", () => {
  test("stores the client", () => {
    const { client } = createMockClient(mainnet);
    const loader = new LiquidityLoader(client);
    expect(loader.client).toBe(client);
  });

  test("uses an empty parameters record by default", () => {
    const { client } = createMockClient(mainnet);
    const loader = new LiquidityLoader(client);
    expect(loader.parameters).toEqual({});
  });

  test("preserves the parameters record verbatim", () => {
    const { client } = createMockClient(mainnet);
    const maxWithdrawalUtilization = {
      [sourceMarketId]: 800000000000000000n,
    };
    const params = {
      defaultMaxWithdrawalUtilization: 950000000000000000n,
      maxWithdrawalUtilization,
    };
    const loader = new LiquidityLoader(client, params);
    expect(loader.parameters).toBe(params);
    expect(loader.parameters.defaultMaxWithdrawalUtilization).toBe(
      950000000000000000n,
    );
    expect(loader.parameters.maxWithdrawalUtilization).toBe(
      maxWithdrawalUtilization,
    );
  });

  test("exposes a fetch method", () => {
    const { client } = createMockClient(mainnet);
    const loader = new LiquidityLoader(client);
    expect(typeof loader.fetch).toBe("function");
  });

  test("fetch returns a Promise that rejects (no RPC mocked)", async () => {
    const { client } = createMockClient(mainnet);
    const loader = new LiquidityLoader(client);
    // The loader needs `getBlock` (eth_getBlockByNumber) which the mock
    // client does not handle by default. Pin the exact error message so a
    // regression that swaps in a different RPC dependency surfaces here
    // rather than silently passing on any rejection.
    await expect(
      loader.fetch(
        "0x0000000000000000000000000000000000000000000000000000000000000001" as MarketId,
      ),
    ).rejects.toThrow(/unhandled RPC eth_getBlockByNumber/);
  });

  test("accepts maxWithdrawalUtilization override map", () => {
    const { client } = createMockClient(mainnet);
    const overrides: Record<MarketId, bigint> = {
      ["0x0000000000000000000000000000000000000000000000000000000000000001" as MarketId]:
        800000000000000000n,
    };
    const loader = new LiquidityLoader(client, {
      maxWithdrawalUtilization: overrides,
    });
    expect(loader.parameters.maxWithdrawalUtilization).toBe(overrides);
  });
});

describe.sequential("LiquidityLoader.fetch", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  test("passes the fetched block timestamp plus one hour into reallocation computation", async () => {
    const pendingCapValidAt = 3_700n;

    mockApiMarkets();
    const firstHandle = setupLoaderMockClient({
      blockTimestamp: 100n,
      targetPendingCapValidAt: pendingCapValidAt,
    });
    const first = await new LiquidityLoader(firstHandle.client).fetch(
      targetMarketId,
    );

    mockApiMarkets();
    const secondHandle = setupLoaderMockClient({
      blockTimestamp: 101n,
      targetPendingCapValidAt: pendingCapValidAt,
    });
    const second = await new LiquidityLoader(secondHandle.client).fetch(
      targetMarketId,
    );

    expect(first.withdrawals).toStrictEqual([
      { id: sourceMarketId, vault, assets: 100n },
    ]);
    expect(second.withdrawals).toStrictEqual([
      { id: sourceMarketId, vault, assets: 1000n },
    ]);
    expect(getBlockCalls(firstHandle)).toStrictEqual([
      { method: "eth_getBlockByNumber", params: ["latest", false] },
    ]);
    expect(getBlockCalls(secondHandle)).toStrictEqual([
      { method: "eth_getBlockByNumber", params: ["latest", false] },
    ]);
  });

  test("uses caller-provided withdrawal utilization options", async () => {
    const cappedHandle = setupLoaderMockClient({
      blockTimestamp: 100n,
      targetPendingCapValue: 10_000n,
      sourceBorrowAssets: 900n,
    });
    mockApiMarkets(900000000000000000n);

    const capped = await new LiquidityLoader(cappedHandle.client).fetch(
      targetMarketId,
    );
    expect(capped.withdrawals).toStrictEqual([]);

    const overrideHandle = setupLoaderMockClient({
      blockTimestamp: 100n,
      targetPendingCapValue: 10_000n,
      sourceBorrowAssets: 900n,
    });
    mockApiMarkets(900000000000000000n);

    const override = await new LiquidityLoader(overrideHandle.client, {
      maxWithdrawalUtilization: {
        [sourceMarketId]: MathLib.WAD,
      },
    }).fetch(targetMarketId);

    expect(override.withdrawals).toStrictEqual([
      { id: sourceMarketId, vault, assets: 100n },
    ]);
  });

  test("rejects when the API response omits requested markets", async () => {
    const handle = setupLoaderMockClient({ blockTimestamp: 100n });
    mockApiMarkets(MathLib.WAD, []);

    await expect(
      new LiquidityLoader(handle.client).fetch(targetMarketId),
    ).rejects.toThrow(
      "did not return a Promise of an Array of the same length",
    );
  });

  test("rejects when the API response omits the markets list", async () => {
    const handle = setupLoaderMockClient({ blockTimestamp: 100n });
    nock(new URL(BLUE_API_GRAPHQL_URL).origin)
      .post("/graphql")
      .reply(200, { data: { markets: {} } });

    await expect(
      new LiquidityLoader(handle.client).fetch(targetMarketId),
    ).rejects.toThrow(
      "did not return a Promise of an Array of the same length",
    );
  });

  test("returns an empty plan when supplying vaults are missing", async () => {
    const handle = setupLoaderMockClient({ blockTimestamp: 100n });
    mockApiMarkets(MathLib.WAD, [
      {
        uniqueKey: targetMarketId,
        targetBorrowUtilization: "900000000000000000",
        publicAllocatorSharedLiquidity: [],
      },
    ]);

    await expect(
      new LiquidityLoader(handle.client).fetch(targetMarketId),
    ).resolves.toMatchObject({ withdrawals: [] });
  });

  test("returns an empty plan when vault allocation is missing", async () => {
    const handle = setupLoaderMockClient({ blockTimestamp: 100n });
    mockApiMarkets(MathLib.WAD, [
      {
        uniqueKey: targetMarketId,
        targetBorrowUtilization: "900000000000000000",
        publicAllocatorSharedLiquidity: [],
        supplyingVaults: [{ address: vault }],
      },
    ]);

    await expect(
      new LiquidityLoader(handle.client).fetch(targetMarketId),
    ).resolves.toMatchObject({ withdrawals: [] });
  });

  test("rejects with the per-market simulation error when utilization overrides throw", async () => {
    const handle = setupLoaderMockClient({ blockTimestamp: 100n });
    const maxWithdrawalUtilization = {} as Record<MarketId, bigint>;
    Object.defineProperty(maxWithdrawalUtilization, sourceMarketId, {
      get() {
        throw new TypeError("bad utilization override");
      },
    });
    mockApiMarkets();

    await expect(
      new LiquidityLoader(handle.client, {
        maxWithdrawalUtilization,
      }).fetch(targetMarketId),
    ).rejects.toThrow(/^An error occurred while simulating reallocations:/);
  });
});
