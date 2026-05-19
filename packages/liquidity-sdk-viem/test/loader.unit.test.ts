import { ChainId, type MarketId } from "@morpho-org/blue-sdk";
import type { Address, Chain, Client, Transport } from "viem";
import { beforeEach, describe, expect, test, vi } from "vitest";

type MockReallocationOptions = {
  readonly timestamp?: bigint;
  readonly maxWithdrawalUtilization?: Readonly<
    Record<string, bigint | undefined>
  >;
  readonly enabled?: boolean;
};

const mocks = vi.hoisted(() => {
  const sourceMarketId = `0x${"22".repeat(32)}`;
  const vault = "0x0000000000000000000000000000000000000001";
  const reallocationCalls: {
    readonly marketId: string;
    readonly options: MockReallocationOptions;
  }[] = [];
  const state = { throwOnReallocation: false };

  class MockReallocationData {
    public constructor(public readonly input: unknown) {}

    public getMarketPublicReallocations(
      marketId: string,
      options: MockReallocationOptions,
    ) {
      reallocationCalls.push({ marketId, options });

      if (state.throwOnReallocation) throw new Error("reallocation failed");

      return {
        data: new MockReallocationData(this.input),
        withdrawals: [
          {
            id: sourceMarketId,
            vault,
            assets: options.timestamp ?? 0n,
          },
        ],
      };
    }
  }

  return {
    fetchMarket: vi.fn(),
    fetchPosition: vi.fn(),
    fetchVault: vi.fn(),
    fetchVaultMarketConfig: vi.fn(),
    getBlock: vi.fn(),
    getMarkets: vi.fn(),
    MockReallocationData,
    reallocationCalls,
    sourceMarketId,
    state,
    vault,
  };
});

vi.doMock("@morpho-org/blue-sdk-viem", () => ({
  fetchMarket: mocks.fetchMarket,
  fetchPosition: mocks.fetchPosition,
  fetchVault: mocks.fetchVault,
  fetchVaultMarketConfig: mocks.fetchVaultMarketConfig,
}));

vi.doMock("@morpho-org/morpho-sdk", () => ({
  ReallocationData: mocks.MockReallocationData,
}));

vi.doMock("viem/actions", () => ({
  getBlock: mocks.getBlock,
}));

vi.doMock("../src/api/index.js", () => ({
  apiSdk: {
    getMarkets: mocks.getMarkets,
  },
}));

vi.doMock("../src/api/index.ts", () => ({
  apiSdk: {
    getMarkets: mocks.getMarkets,
  },
}));

const { LiquidityLoader } = await import("../src/index.js");

const targetMarketId = `0x${"11".repeat(32)}` as MarketId;
const secondMarketId = `0x${"33".repeat(32)}` as MarketId;
const sourceMarketId = mocks.sourceMarketId as MarketId;
const vault = mocks.vault as Address;
const targetWithdrawalUtilization = 91_0000000000000000n;
const sourceWithdrawalUtilization = 92_0000000000000000n;

type ApiAllocationMarket = {
  readonly uniqueKey: MarketId;
  readonly targetWithdrawUtilization: bigint;
};

type ApiSupplyingVault = {
  readonly address: Address;
  readonly state?: {
    readonly allocation?: readonly { readonly market: ApiAllocationMarket }[];
  };
};

type ApiMarket = {
  readonly uniqueKey: MarketId;
  readonly targetBorrowUtilization: bigint;
  readonly supplyingVaults?: readonly ApiSupplyingVault[];
};

const client = {
  chain: { id: ChainId.EthMainnet },
} as Client<Transport, Chain>;

const defaultSupplyingVaults = [
  {
    address: vault,
    state: {
      allocation: [
        {
          market: {
            uniqueKey: targetMarketId,
            targetWithdrawUtilization: targetWithdrawalUtilization,
          },
        },
        {
          market: {
            uniqueKey: sourceMarketId,
            targetWithdrawUtilization: sourceWithdrawalUtilization,
          },
        },
      ],
    },
  },
] satisfies readonly ApiSupplyingVault[];

const makeApiMarket = (
  params: {
    readonly uniqueKey?: MarketId;
    readonly supplyingVaults?: readonly ApiSupplyingVault[];
  } = {},
): ApiMarket => ({
  uniqueKey: params.uniqueKey ?? targetMarketId,
  targetBorrowUtilization: 90_0000000000000000n,
  supplyingVaults: Object.hasOwn(params, "supplyingVaults")
    ? params.supplyingVaults
    : defaultSupplyingVaults,
});

const mockMarketsResponse = (items?: readonly ApiMarket[]) => ({
  markets: { items },
});

describe.sequential("LiquidityLoader", () => {
  beforeEach(() => {
    mocks.fetchMarket.mockReset();
    mocks.fetchPosition.mockReset();
    mocks.fetchVault.mockReset();
    mocks.fetchVaultMarketConfig.mockReset();
    mocks.getBlock.mockReset();
    mocks.getMarkets.mockReset();
    mocks.reallocationCalls.length = 0;
    mocks.state.throwOnReallocation = false;

    mocks.fetchMarket.mockImplementation((marketId: MarketId) => ({
      id: marketId,
    }));
    mocks.fetchVault.mockImplementation((address: Address) => ({ address }));
    mocks.fetchPosition.mockImplementation(
      (address: Address, marketId: MarketId) => ({
        user: address,
        marketId,
      }),
    );
    mocks.fetchVaultMarketConfig.mockImplementation(
      (address: Address, marketId: MarketId) => ({
        vault: address,
        marketId,
      }),
    );
  });

  test("passes the fetched block timestamp into reallocation computation", async () => {
    mocks.getBlock
      .mockResolvedValueOnce({ number: 10n, timestamp: 100n })
      .mockResolvedValueOnce({ number: 11n, timestamp: 125n });
    mocks.getMarkets.mockResolvedValue(mockMarketsResponse([makeApiMarket()]));

    const first = await new LiquidityLoader(client).fetch(targetMarketId);
    const second = await new LiquidityLoader(client).fetch(targetMarketId);

    expect(first.withdrawals).toStrictEqual([
      { id: sourceMarketId, vault, assets: 100n },
    ]);
    expect(second.withdrawals).toStrictEqual([
      { id: sourceMarketId, vault, assets: 125n },
    ]);
    expect(
      mocks.reallocationCalls.map(({ options }) => options.timestamp),
    ).toStrictEqual([100n, 125n]);
    expect(mocks.reallocationCalls[0]?.options).toMatchObject({
      enabled: true,
      maxWithdrawalUtilization: {
        [targetMarketId]: targetWithdrawalUtilization,
        [sourceMarketId]: sourceWithdrawalUtilization,
      },
    });
    expect(mocks.fetchMarket).toHaveBeenCalledWith(targetMarketId, client, {
      blockNumber: 10n,
    });
  });

  test("uses caller-provided withdrawal utilization options", async () => {
    const maxWithdrawalUtilization = {
      [sourceMarketId]: 99_0000000000000000n,
    };

    mocks.getBlock.mockResolvedValue({ number: 10n, timestamp: 100n });
    mocks.getMarkets.mockResolvedValue(mockMarketsResponse([makeApiMarket()]));

    await new LiquidityLoader(client, {
      defaultMaxWithdrawalUtilization: 98_0000000000000000n,
      maxWithdrawalUtilization,
    }).fetch(targetMarketId);

    expect(mocks.reallocationCalls[0]?.options).toMatchObject({
      defaultMaxWithdrawalUtilization: 98_0000000000000000n,
      maxWithdrawalUtilization,
      timestamp: 100n,
    });
  });

  test("rejects when reallocation computation fails", async () => {
    mocks.state.throwOnReallocation = true;
    mocks.getBlock.mockResolvedValue({ number: 10n, timestamp: 100n });
    mocks.getMarkets.mockResolvedValue(mockMarketsResponse([makeApiMarket()]));

    await expect(
      new LiquidityLoader(client).fetch(targetMarketId),
    ).rejects.toThrow("An error occurred while simulating reallocations");
  });

  test("handles missing optional API collections", async () => {
    mocks.getBlock.mockResolvedValue({ number: 10n, timestamp: 100n });
    mocks.getMarkets.mockResolvedValue(
      mockMarketsResponse([
        makeApiMarket({
          uniqueKey: targetMarketId,
          supplyingVaults: [{ address: vault }],
        }),
        makeApiMarket({
          uniqueKey: secondMarketId,
          supplyingVaults: undefined,
        }),
      ]),
    );

    const loader = new LiquidityLoader(client);
    const [target, second] = await Promise.all([
      loader.fetch(targetMarketId),
      loader.fetch(secondMarketId),
    ]);

    expect(target.targetBorrowUtilization).toBe(90_0000000000000000n);
    expect(second.targetBorrowUtilization).toBe(90_0000000000000000n);
    expect(mocks.fetchPosition).not.toHaveBeenCalled();
    expect(mocks.fetchVaultMarketConfig).not.toHaveBeenCalled();
  });

  test("rejects when the API response omits requested markets", async () => {
    mocks.getBlock.mockResolvedValue({ number: 10n, timestamp: 100n });
    mocks.getMarkets.mockResolvedValue(mockMarketsResponse());

    await expect(
      new LiquidityLoader(client).fetch(targetMarketId),
    ).rejects.toThrow(
      "did not return a Promise of an Array of the same length",
    );
  });
});
