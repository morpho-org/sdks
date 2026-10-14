import {
  AccrualVaultV2MidnightAdapter,
  addressesRegistry,
  ChainId,
  UnknownFactory,
  UnknownOfFactory,
  VaultV2MidnightAdapter,
  VaultV2MidnightAdapterUtils,
} from "@morpho-org/blue-sdk";
import { midnightAbi } from "@morpho-org/midnight-sdk";
import { midnightCoreReadAbi } from "@morpho-org/morpho-ts/abis/midnight";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import type { Address, Hash } from "viem";
import {
  encodeErrorResult,
  numberToHex,
  RawContractError,
  zeroAddress,
} from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  encodeReadResult,
  extendRpc,
  mockDeploylessReads,
} from "../../__test__/viem.js";
import { midnightAdapterAbi, midnightAdapterFactoryAbi } from "../../abis.js";
import { UnresolvedBlockNumberError } from "../../error.js";
import { abi as queryAbi } from "../../queries/vault-v2/GetVaultV2MidnightAdapter.js";
import {
  fetchAccrualVaultV2MidnightAdapter,
  fetchVaultV2MidnightAdapter,
  toAccrualVaultV2MidnightAdapter,
  toVaultV2MidnightAdapter,
} from "./VaultV2MidnightAdapter.js";

const FACTORY = addressesRegistry[ChainId.BaseMainnet].midnightAdapterFactory!;
const ADDRESS: Address = "0x3333333333333333333333333333333333333333";
const PARENT_VAULT: Address = "0x1111111111111111111111111111111111111111";
const ASSET: Address = "0x2222222222222222222222222222222222222222";
const MIDNIGHT: Address = "0x4444444444444444444444444444444444444444";
const RECIPIENT: Address = "0x5555555555555555555555555555555555555555";
const MARKET_ID: Hash =
  "0xabababababababababababababababababababababababababababababababab";
const POSITION = {
  credit: 100n,
  pendingFee: 2n,
  lastLossFactor: 3n,
  lastAccrual: 4n,
};
const BLOCK_NUMBER = 123n;
const BLOCK_TIMESTAMP = 456n;
const UNKNOWN_OF_FACTORY_ABI = [
  {
    type: "error",
    name: "UnknownOfFactory",
    inputs: [{ type: "address" }, { type: "address" }],
  },
] as const;

function unknownOfFactoryRevert() {
  return new RawContractError({
    data: encodeErrorResult({
      abi: UNKNOWN_OF_FACTORY_ABI,
      errorName: "UnknownOfFactory",
      args: [FACTORY, ADDRESS],
    }),
  });
}

function mockBlock(
  handle: ReturnType<typeof createMockClient>,
  number: bigint | null,
) {
  const hash = `0x${"11".repeat(32)}`;
  return extendRpc(handle, async (call, baseRequest) => {
    if (call.method !== "eth_getBlockByNumber") return baseRequest(call);
    return {
      baseFeePerGas: "0x1",
      difficulty: "0x0",
      extraData: "0x",
      gasLimit: "0x100000",
      gasUsed: "0x1",
      hash,
      logsBloom: `0x${"00".repeat(256)}`,
      miner: zeroAddress,
      mixHash: hash,
      nonce: "0x0000000000000000",
      number: number === null ? null : numberToHex(number),
      parentHash: hash,
      receiptsRoot: hash,
      sha3Uncles: hash,
      size: "0x1",
      stateRoot: hash,
      timestamp: numberToHex(BLOCK_TIMESTAMP),
      transactions: [],
      transactionsRoot: hash,
      uncles: [],
    };
  });
}

function mockAdapterReads(
  handle: ReturnType<typeof createMockClient>,
  isAdapter = true,
) {
  mockRead(handle, {
    address: FACTORY,
    abi: midnightAdapterFactoryAbi,
    functionName: "isMidnightAdapter",
    result: isAdapter,
  });
  for (const [functionName, result] of [
    ["parentVault", PARENT_VAULT],
    ["asset", ASSET],
    ["skimRecipient", RECIPIENT],
    ["midnight", MIDNIGHT],
    ["maxTtm", 10n],
    ["minRate", 20n],
    ["noSalesWithShortfall", true],
    ["noSalesBelowFaceValue", false],
    ["durations", [30n, 60n]],
    ["marketIdsLength", 1n],
    ["durationAllocations", [40n, 50n]],
    ["marketIds", MARKET_ID],
    ["marketData", [11n, 12n, 13n, 14n, true]],
  ] as const) {
    mockRead(handle, {
      address: ADDRESS,
      abi: midnightAdapterAbi,
      functionName,
      result,
    });
  }
}

function mockMidnightCoreReads(handle: ReturnType<typeof createMockClient>) {
  mockRead(handle, {
    address: MIDNIGHT,
    abi: midnightCoreReadAbi,
    functionName: "position",
    result: [
      POSITION.credit,
      POSITION.pendingFee,
      POSITION.lastLossFactor,
      POSITION.lastAccrual,
      0n,
      0n,
    ],
  });
  mockRead(handle, {
    address: MIDNIGHT,
    abi: midnightCoreReadAbi,
    functionName: "marketState",
    result: [0n, 5n, 0n, 0n, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  });
}

function expectCallsPinned(
  handle: ReturnType<typeof createMockClient>,
  blockNumber: bigint,
) {
  const blockTags = handle.request.mock.calls
    .filter(([call]) => call.method === "eth_call")
    .map(([call]) => (call.params as readonly unknown[] | undefined)?.[1]);
  expect(blockTags.length).toBeGreaterThan(0);
  expect(blockTags).toEqual(
    Array.from({ length: blockTags.length }, () => numberToHex(blockNumber)),
  );
}

describe("Vault V2 Midnight adapter fetchers", () => {
  test("fallback decodes adapter configuration and market face value", async () => {
    const handle = createMockClient(base);
    mockBlock(handle, BLOCK_NUMBER);
    mockRead(handle, {
      address: FACTORY,
      abi: midnightAdapterFactoryAbi,
      functionName: "isMidnightAdapter",
      result: true,
    });
    for (const [functionName, result] of [
      ["parentVault", PARENT_VAULT],
      ["asset", ASSET],
      ["skimRecipient", RECIPIENT],
      ["midnight", MIDNIGHT],
      ["maxTtm", 10n],
      ["minRate", 20n],
      ["noSalesWithShortfall", true],
      ["noSalesBelowFaceValue", false],
      ["durations", [30n, 60n]],
      ["marketIdsLength", 1n],
      ["durationAllocations", [40n, 50n]],
      ["marketIds", MARKET_ID],
      ["marketData", [11n, 12n, 13n, 14n, true]],
    ] as const) {
      mockRead(handle, {
        address: ADDRESS,
        abi: midnightAdapterAbi,
        functionName,
        result,
      });
    }

    const adapter = await fetchVaultV2MidnightAdapter(ADDRESS, handle.client, {
      deployless: false,
    });

    expectCallsPinned(handle, BLOCK_NUMBER);
    expect(adapter).toBeInstanceOf(VaultV2MidnightAdapter);
    expect(adapter.marketIds).toEqual([MARKET_ID]);
    expect(Object.keys(adapter.marketData)).toEqual(adapter.marketIds);
    expect(() =>
      VaultV2MidnightAdapterUtils.validateMarkets(adapter, [
        {
          id: MARKET_ID,
          position: POSITION,
          market: { lossFactor: 5n },
        },
      ]),
    ).not.toThrow();
    expect(adapter.marketData[MARKET_ID]).toEqual({
      netCredit: 11n,
      rate: 12n,
      maturity: 13n,
      index: 14n,
      forceSellable: true,
    });
    expect(adapter.durationAllocations).toEqual([40n, 50n]);
  });

  test("base fetcher falls back to direct reads when the deployless call fails", async () => {
    const fallbackHandle = createMockClient(base);
    mockDeploylessReads(fallbackHandle, ["0x"]);
    mockBlock(fallbackHandle, BLOCK_NUMBER);
    mockAdapterReads(fallbackHandle);

    const directHandle = createMockClient(base);
    mockBlock(directHandle, BLOCK_NUMBER);
    mockAdapterReads(directHandle);

    const [fallback, direct] = await Promise.all([
      fetchVaultV2MidnightAdapter(ADDRESS, fallbackHandle.client),
      fetchVaultV2MidnightAdapter(ADDRESS, directHandle.client, {
        deployless: false,
      }),
    ]);

    expect(fallback).toStrictEqual(direct);
  });

  test("default deployless fetchers pin the requested block", async () => {
    const response = {
      parentVault: PARENT_VAULT,
      asset: ASSET,
      skimRecipient: RECIPIENT,
      midnight: MIDNIGHT,
      maxTtm: 10n,
      minRate: 20n,
      noSalesWithShortfall: true,
      noSalesBelowFaceValue: false,
      durations: [30n],
      durationAllocations: [40n],
      markets: [
        {
          id: MARKET_ID,
          marketData: {
            netCredit: 11n,
            rate: 12n,
            maturity: 13n,
            index: 14n,
            forceSellable: true,
          },
          position: POSITION,
          lossFactor: 5n,
        },
      ],
      timestamp: BLOCK_TIMESTAMP,
    };
    const encodedResponse = encodeReadResult(queryAbi, "query", response);

    const baseHandle = createMockClient(base);
    mockDeploylessReads(baseHandle, [encodedResponse]);

    await fetchVaultV2MidnightAdapter(ADDRESS, baseHandle.client, {
      blockNumber: BLOCK_NUMBER,
    });

    const baseDeploylessCalls = baseHandle.request.mock.calls.filter(
      ([call]) => {
        if (call.method !== "eth_call") return false;
        const [tx] = (call.params ?? []) as [{ to?: Address }];
        return tx?.to == null;
      },
    );
    expect(baseDeploylessCalls).toHaveLength(1);
    expect(baseDeploylessCalls[0]?.[0].params?.[1]).toBe(
      numberToHex(BLOCK_NUMBER),
    );

    const accrualHandle = createMockClient(base);
    mockDeploylessReads(accrualHandle, [encodedResponse]);

    const accrual = await fetchAccrualVaultV2MidnightAdapter(
      ADDRESS,
      accrualHandle.client,
      { blockNumber: BLOCK_NUMBER },
    );

    const accrualDeploylessCalls = accrualHandle.request.mock.calls.filter(
      ([call]) => {
        if (call.method !== "eth_call") return false;
        const [tx] = (call.params ?? []) as [{ to?: Address }];
        return tx?.to == null;
      },
    );
    expect(accrualDeploylessCalls).toHaveLength(1);
    expect(accrualDeploylessCalls[0]?.[0].params?.[1]).toBe(
      numberToHex(BLOCK_NUMBER),
    );
    expect(accrual.lastUpdate).toBe(BLOCK_TIMESTAMP);
  });

  test("throws for a pending block when resolving the base read block", async () => {
    const handle = createMockClient(base);
    mockBlock(handle, null);

    await expect(
      fetchVaultV2MidnightAdapter(ADDRESS, handle.client, {
        blockTag: "pending",
        deployless: false,
      }),
    ).rejects.toBeInstanceOf(UnresolvedBlockNumberError);
  });

  test("accrual fetcher requires a registered factory", async () => {
    const handle = createMockClient(mainnet);
    mockBlock(handle, BLOCK_NUMBER);

    await expect(
      fetchAccrualVaultV2MidnightAdapter(ADDRESS, handle.client, {
        deployless: false,
      }),
    ).rejects.toBeInstanceOf(UnknownFactory);
  });

  test("accrual fetcher rejects addresses outside the registered factory", async () => {
    const handle = createMockClient(base);
    mockBlock(handle, BLOCK_NUMBER);
    mockAdapterReads(handle, false);

    await expect(
      fetchAccrualVaultV2MidnightAdapter(ADDRESS, handle.client, {
        deployless: false,
      }),
    ).rejects.toBeInstanceOf(UnknownOfFactory);
  });

  test("accrual fetcher pins reads and decodes position and loss factor", async () => {
    const handle = createMockClient(base);
    mockBlock(handle, BLOCK_NUMBER);
    mockAdapterReads(handle);
    mockMidnightCoreReads(handle);

    const adapter = await fetchAccrualVaultV2MidnightAdapter(
      ADDRESS,
      handle.client,
      { blockTag: "safe", deployless: false },
    );

    expect(adapter.lastUpdate).toBe(BLOCK_TIMESTAMP);
    expect(adapter.markets).toMatchObject([
      {
        id: MARKET_ID,
        position: POSITION,
        market: { lossFactor: 5n },
      },
    ]);
    expectCallsPinned(handle, BLOCK_NUMBER);
  });

  test("accrual fetcher falls back to direct reads when the deployless call fails", async () => {
    const fallbackHandle = createMockClient(base);
    mockDeploylessReads(fallbackHandle, ["0x"]);
    mockBlock(fallbackHandle, BLOCK_NUMBER);
    mockAdapterReads(fallbackHandle);
    mockMidnightCoreReads(fallbackHandle);

    const directHandle = createMockClient(base);
    mockBlock(directHandle, BLOCK_NUMBER);
    mockAdapterReads(directHandle);
    mockMidnightCoreReads(directHandle);

    const [fallback, direct] = await Promise.all([
      fetchAccrualVaultV2MidnightAdapter(ADDRESS, fallbackHandle.client),
      fetchAccrualVaultV2MidnightAdapter(ADDRESS, directHandle.client, {
        deployless: false,
      }),
    ]);

    expect(fallback).toStrictEqual(direct);
  });

  test("accrual fetcher throws when the resolved block is pending", async () => {
    const handle = createMockClient(base);
    mockBlock(handle, null);

    await expect(
      fetchAccrualVaultV2MidnightAdapter(ADDRESS, handle.client, {
        blockTag: "pending",
        deployless: false,
      }),
    ).rejects.toBeInstanceOf(UnresolvedBlockNumberError);
  });

  test("maps deployless UnknownOfFactory reverts", async () => {
    const handle = createMockClient(base);
    mockDeploylessReads(handle, [unknownOfFactoryRevert()]);

    await expect(
      fetchVaultV2MidnightAdapter(ADDRESS, handle.client),
    ).rejects.toBeInstanceOf(UnknownOfFactory);
  });

  test("rethrows forced deployless base-fetcher failures without fallback", async () => {
    const handle = createMockClient(base);
    mockDeploylessReads(handle, ["0x"]);
    mockBlock(handle, BLOCK_NUMBER);
    mockAdapterReads(handle);

    // The full fallback path is mocked, so only the forced rethrow can make this reject.
    await expect(
      fetchVaultV2MidnightAdapter(ADDRESS, handle.client, {
        deployless: "force",
      }),
    ).rejects.toThrow();
    expect(
      handle.request.mock.calls.filter(([call]) => call.method === "eth_call"),
    ).toHaveLength(1);
  });

  test("maps accrual deployless UnknownOfFactory reverts", async () => {
    const handle = createMockClient(base);
    mockDeploylessReads(handle, [unknownOfFactoryRevert()]);

    await expect(
      fetchAccrualVaultV2MidnightAdapter(ADDRESS, handle.client),
    ).rejects.toBeInstanceOf(UnknownOfFactory);
  });

  test("rethrows forced deployless accrual failures without fallback", async () => {
    const handle = createMockClient(base);
    mockDeploylessReads(handle, ["0x"]);
    mockBlock(handle, BLOCK_NUMBER);
    mockAdapterReads(handle);
    mockMidnightCoreReads(handle);

    // The full fallback path is mocked, so only the forced rethrow can make this reject.
    await expect(
      fetchAccrualVaultV2MidnightAdapter(ADDRESS, handle.client, {
        deployless: "force",
      }),
    ).rejects.toThrow();
    expect(
      handle.request.mock.calls.filter(([call]) => call.method === "eth_call"),
    ).toHaveLength(1);
  });

  test("requires a registered Midnight adapter factory", async () => {
    const { client } = createMockClient(mainnet);

    await expect(
      fetchVaultV2MidnightAdapter(ADDRESS, client, { deployless: false }),
    ).rejects.toBeInstanceOf(UnknownFactory);
  });

  test("keeps market data limited to held markets", () => {
    const adapter = toVaultV2MidnightAdapter(ADDRESS, {
      parentVault: PARENT_VAULT,
      asset: ASSET,
      skimRecipient: RECIPIENT,
      midnight: MIDNIGHT,
      maxTtm: 10n,
      minRate: 20n,
      noSalesWithShortfall: true,
      noSalesBelowFaceValue: false,
      durations: [30n],
      durationAllocations: [40n],
      markets: [
        {
          id: MARKET_ID,
          marketData: {
            netCredit: 11n,
            rate: 12n,
            maturity: 13n,
            index: 14n,
            forceSellable: true,
          },
        },
      ],
    });
    const markets = [
      {
        id: MARKET_ID,
        position: POSITION,
        market: { lossFactor: 5n },
      },
    ];

    expect(adapter.marketIds).toEqual([MARKET_ID]);
    expect(Object.keys(adapter.marketData)).toEqual(adapter.marketIds);
    expect(() =>
      VaultV2MidnightAdapterUtils.validateMarkets(adapter, markets),
    ).not.toThrow();
  });

  test("rejects addresses outside the registered Midnight factory", async () => {
    const handle = createMockClient(base);
    mockBlock(handle, BLOCK_NUMBER);
    mockRead(handle, {
      address: FACTORY,
      abi: midnightAdapterFactoryAbi,
      functionName: "isMidnightAdapter",
      result: false,
    });
    for (const [functionName, result] of [
      ["parentVault", PARENT_VAULT],
      ["asset", ASSET],
      ["skimRecipient", RECIPIENT],
      ["midnight", MIDNIGHT],
      ["maxTtm", 10n],
      ["minRate", 20n],
      ["noSalesWithShortfall", true],
      ["noSalesBelowFaceValue", false],
      ["durations", []],
      ["marketIdsLength", 0n],
    ] as const) {
      mockRead(handle, {
        address: ADDRESS,
        abi: midnightAdapterAbi,
        functionName,
        result,
      });
    }

    await expect(
      fetchVaultV2MidnightAdapter(ADDRESS, handle.client, {
        deployless: false,
      }),
    ).rejects.toBeInstanceOf(UnknownOfFactory);
  });

  test("keeps accrued market inputs separate from onchain face-value allocation", () => {
    const adapter = toVaultV2MidnightAdapter(ADDRESS, {
      parentVault: PARENT_VAULT,
      skimRecipient: RECIPIENT,
      asset: ASSET,
      midnight: MIDNIGHT,
      markets: [
        {
          id: MARKET_ID,
          marketData: {
            netCredit: 11n,
            rate: 12n,
            maturity: 13n,
            index: 14n,
            forceSellable: true,
          },
        },
      ],
      durations: [30n],
      durationAllocations: [40n],
      maxTtm: 10n,
      minRate: 20n,
      noSalesWithShortfall: true,
      noSalesBelowFaceValue: false,
    });
    const markets = [
      {
        id: MARKET_ID,
        position: POSITION,
        market: { lossFactor: 5n },
      },
    ];
    expect(Object.keys(adapter.marketData)).toEqual(adapter.marketIds);
    expect(() =>
      VaultV2MidnightAdapterUtils.validateMarkets(adapter, markets),
    ).not.toThrow();

    const accrued = toAccrualVaultV2MidnightAdapter(adapter, {
      markets: markets.map(({ id, position, market }) => ({
        id,
        position,
        lossFactor: market.lossFactor,
      })),
      lastUpdate: 6n,
    });

    expect(accrued).toBeInstanceOf(AccrualVaultV2MidnightAdapter);
    expect(accrued.markets[0]).toMatchObject({
      id: MARKET_ID,
      position: POSITION,
      market: { lossFactor: 5n },
    });
    expect(accrued.markets[0]).not.toHaveProperty("rate");
    expect(accrued.markets[0]).not.toHaveProperty("forceSellable");
    expect(accrued.markets[0]?.market).not.toHaveProperty("maturity");
    expect(accrued.marketData[MARKET_ID]?.netCredit).toBe(11n);
  });

  test("keeps its fallback ABI fragment in sync with the Midnight SDK", () => {
    const source = midnightAbi
      .filter(
        (entry) =>
          entry.type === "function" &&
          (entry.name === "position" || entry.name === "marketState"),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    expect(
      [...midnightCoreReadAbi].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    ).toEqual(source);
  });
});
