import {
  AccrualPosition,
  AccrualVaultV2,
  Market,
  MarketParams,
} from "@morpho-org/blue-sdk";
import {
  fetchAccrualPosition,
  fetchAccrualVaultV2,
  fetchMarket,
  fetchVaultV2BluePublicAllocatorData,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { morphoViemExtension } from "../../client/index.js";
import { VaultV2BlueReallocationData } from "../vaultV2BlueReallocationData.js";

// Check entity-to-fetcher dispatch, not onchain state or accrual. Viem balance reads still use
// the transport mock; contract round-trips remain the responsibility of the fork suite.
vi.mock("@morpho-org/blue-sdk-viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@morpho-org/blue-sdk-viem")>()),
  fetchMarket: vi.fn(),
  fetchAccrualPosition: vi.fn(),
  fetchAccrualVaultV2: vi.fn(),
  fetchVaultV2BluePublicAllocatorData: vi.fn(),
}));

const makeFixture = () => {
  const raw = new MarketParams({
    loanToken: "0x0000000000000000000000000000000000000011",
    collateralToken: "0x0000000000000000000000000000000000000012",
    oracle: zeroAddress,
    irm: zeroAddress,
    lltv: 860_000_000_000_000_000n,
  });
  const original = new MarketParams(raw);
  const replacement = new MarketParams({
    loanToken: "0x0000000000000000000000000000000000000021",
    collateralToken: "0x0000000000000000000000000000000000000022",
    oracle: "0x0000000000000000000000000000000000000023",
    irm: "0x0000000000000000000000000000000000000024",
    lltv: 800_000_000_000_000_000n,
  });
  const handle = createMockClient(mainnet);
  const entity = handle.client
    .extend(morphoViemExtension({ supportDeployless: false }))
    .morpho.blue(raw, mainnet.id);
  const market = new Market({
    params: original,
    totalSupplyAssets: 100n,
    totalSupplyShares: 100_000_000n,
    totalBorrowAssets: 0n,
    totalBorrowShares: 0n,
    lastUpdate: 1n,
    fee: 0n,
  });
  const mutate = () => Object.assign(raw, replacement);
  return { raw, original, replacement, handle, entity, market, mutate };
};

beforeEach(() => vi.clearAllMocks());

describe.sequential("MorphoBlue owned-market read and planning dispatch", () => {
  test("getMarketData retains the original ID after caller mutation", async () => {
    const { entity, raw, original, market, handle, mutate } = makeFixture();
    vi.mocked(fetchMarket).mockResolvedValue(market);
    mutate();
    // Preserve the established raw property, but never use it to choose the read target.
    expect(Reflect.get(entity, "marketParams")).toBe(raw);
    expect(raw.id).not.toBe(original.id);
    await expect(entity.getMarketData({ blockNumber: 42n })).resolves.toBe(
      market,
    );
    expect(fetchMarket).toHaveBeenCalledExactlyOnceWith(
      original.id,
      handle.client,
      {
        blockNumber: 42n,
        deployless: false,
      },
    );
  });

  test("getPositionData retains the original ID after caller mutation", async () => {
    const { entity, original, market, handle, mutate } = makeFixture();
    const position = new AccrualPosition(
      { user: zeroAddress, supplyShares: 1n, borrowShares: 0n, collateral: 0n },
      market,
    );
    vi.mocked(fetchAccrualPosition).mockResolvedValue(position);
    mutate();
    await expect(
      entity.getPositionData(zeroAddress, { blockNumber: 42n }),
    ).resolves.toBe(position);
    expect(fetchAccrualPosition).toHaveBeenCalledExactlyOnceWith(
      zeroAddress,
      original.id,
      handle.client,
      {
        blockNumber: 42n,
        deployless: false,
      },
    );
  });

  test("getVaultV2BlueReallocationData retains the ID, loan token and complete target tuple", async () => {
    const { entity, original, replacement, raw, market, handle, mutate } =
      makeFixture();
    const vault = new AccrualVaultV2(
      {
        address: "0x0000000000000000000000000000000000000031",
        asset: original.loanToken,
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
      [],
      0n,
      {},
    );
    vi.mocked(fetchMarket).mockResolvedValue(market);
    vi.mocked(fetchAccrualVaultV2).mockResolvedValue(vault);
    vi.mocked(fetchVaultV2BluePublicAllocatorData).mockResolvedValue({
      publicAllocatorConfig: undefined,
      activeAdapters: new Set(),
      marketPublicAllocatorConfigs: {},
      allocations: {},
    });
    mockRead(handle, {
      address: original.loanToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 123n,
    });
    mutate();
    const data = await entity.getVaultV2BlueReallocationData({
      vaultAddresses: [vault.address],
      block: { number: 42n, timestamp: 1n },
    });
    const fetchParams = {
      blockNumber: 42n,
      chainId: mainnet.id,
      deployless: false,
    };
    expect(fetchMarket).toHaveBeenCalledExactlyOnceWith(
      original.id,
      handle.client,
      fetchParams,
    );
    expect(fetchAccrualVaultV2).toHaveBeenCalledExactlyOnceWith(
      vault.address,
      handle.client,
      fetchParams,
    );
    expect(fetchVaultV2BluePublicAllocatorData).toHaveBeenCalledExactlyOnceWith(
      vault,
      handle.client,
      {
        ...fetchParams,
        targetMarketParams: original,
      },
    );
    const target = vi.mocked(fetchVaultV2BluePublicAllocatorData).mock
      .calls[0]?.[2]?.targetMarketParams;
    expect(target).not.toBe(raw);
    expect(target).toEqual(original);
    expect(data.blueBalances).toEqual({ [original.loanToken]: 123n });
    expect(data.blueBalances[replacement.loanToken]).toBeUndefined();
    expect(Object.keys(data.markets)).toEqual([original.id]);
    expect(handle.request).toHaveBeenCalledWith(
      {
        method: "eth_call",
        params: [
          {
            to: original.loanToken,
            data: expect.stringContaining(
              getChainAddress(mainnet.id, "blue").slice(2).toLowerCase(),
            ),
          },
          "0x2a",
        ],
      },
      undefined,
    );
  });

  test("getVaultV2BlueReallocations retains the original planning ID after caller mutation", () => {
    const { entity, original, mutate } = makeFixture();
    const data = new VaultV2BlueReallocationData({ chainId: mainnet.id });
    const expected = { reallocations: [], data } as const;
    const planner = vi
      .spyOn(data, "computeVaultV2BlueReallocations")
      .mockReturnValue(expected);
    mutate();
    const options = { enabled: false } as const;
    expect(
      entity.getVaultV2BlueReallocations({ reallocationData: data, options }),
    ).toBe(expected);
    expect(planner).toHaveBeenCalledExactlyOnceWith(original.id, options);
  });
});
