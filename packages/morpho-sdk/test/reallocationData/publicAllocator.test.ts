import {
  ChainId,
  Market,
  type MarketId,
  MarketParams,
  Position,
  SECONDS_PER_YEAR,
  Vault,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import { type Address, parseEther, parseUnits, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  type InputReallocationData,
  ReallocationData,
} from "../../src/entities/reallocationData.js";

const timestamp = 12345n;

const tokenA: Address = "0x1111111111111111111111111111111111111111";
const tokenB: Address = "0x2222222222222222222222222222222222222222";
const vaultA: Address = "0x000000000000000000000000000000000000000A";
const vaultC: Address = "0x000000000000000000000000000000000000000C";

const makeParams = (suffix: string, loanToken: Address) =>
  new MarketParams({
    loanToken,
    collateralToken:
      `0x0000000000000000000000000000000000001${suffix}` as Address,
    oracle: `0x0000000000000000000000000000000000002${suffix}` as Address,
    irm: "0x0000000000000000000000000000000000003000",
    lltv: 860000000000000000n,
  });

const marketA1Params = makeParams("001", tokenA);
const marketA2Params = makeParams("002", tokenA);
const marketA3Params = makeParams("003", tokenA);
const marketB1Params = makeParams("004", tokenB);
const marketB2Params = makeParams("005", tokenB);

const makeMarket = ({
  params,
  totalBorrowAssets,
  totalSupplyAssets,
  decimals,
  rateAtTarget,
  price,
}: {
  readonly params: MarketParams;
  readonly totalBorrowAssets: bigint;
  readonly totalSupplyAssets: bigint;
  readonly decimals: number;
  readonly rateAtTarget: bigint;
  readonly price: bigint;
}) =>
  new Market({
    params,
    totalBorrowAssets,
    totalBorrowShares: parseUnits(
      (totalBorrowAssets / 10n ** BigInt(decimals)).toString(),
      decimals + 6,
    ),
    totalSupplyAssets,
    totalSupplyShares: parseUnits(
      (totalSupplyAssets / 10n ** BigInt(decimals)).toString(),
      decimals + 6,
    ),
    lastUpdate: timestamp,
    fee: 0n,
    price,
    rateAtTarget,
  });

const marketA1 = makeMarket({
  params: marketA1Params,
  totalBorrowAssets: parseUnits("10000", 6),
  totalSupplyAssets: parseUnits("10750", 6),
  decimals: 6,
  price: parseUnits("2", 24),
  rateAtTarget: parseEther("0.007") / SECONDS_PER_YEAR,
});
const marketA2 = makeMarket({
  params: marketA2Params,
  totalBorrowAssets: parseUnits("10000", 6),
  totalSupplyAssets: parseUnits("20200", 6),
  decimals: 6,
  price: parseUnits("3", 24),
  rateAtTarget: parseEther("0.05") / SECONDS_PER_YEAR,
});
const marketA3 = makeMarket({
  params: marketA3Params,
  totalBorrowAssets: parseUnits("5000", 6),
  totalSupplyAssets: parseUnits("5300", 6),
  decimals: 6,
  price: parseUnits("2.5", 24),
  rateAtTarget: parseEther("0.04") / SECONDS_PER_YEAR,
});
const marketB1 = makeMarket({
  params: marketB1Params,
  totalBorrowAssets: parseEther("10000"),
  totalSupplyAssets: parseEther("20000"),
  decimals: 18,
  price: parseUnits("3", 36),
  rateAtTarget: parseEther("0.05") / SECONDS_PER_YEAR,
});
const marketB2 = makeMarket({
  params: marketB2Params,
  totalBorrowAssets: parseEther("10000"),
  totalSupplyAssets: parseEther("20000"),
  decimals: 18,
  price: parseUnits("3", 36),
  rateAtTarget: parseEther("0.05") / SECONDS_PER_YEAR,
});

// biome-ignore lint/complexity/useMaxParams: fixture rows are clearer with the position tuple fields inline.
const makePosition = (
  user: Address,
  marketId: MarketId,
  supplyShares: bigint,
) =>
  new Position({
    user,
    marketId,
    supplyShares,
    borrowShares: 0n,
    collateral: 0n,
  });

const makeVault = ({
  address,
  asset,
  supplyQueue,
  withdrawQueue,
  fee,
  totalAssets,
}: {
  readonly address: Address;
  readonly asset: Address;
  readonly supplyQueue: readonly MarketId[];
  readonly withdrawQueue: readonly MarketId[];
  readonly fee: bigint;
  readonly totalAssets: bigint;
}) =>
  new Vault({
    address,
    name: "Vault",
    symbol: "vTEST",
    decimalsOffset: 12n,
    asset,
    curator: zeroAddress,
    owner: zeroAddress,
    guardian: zeroAddress,
    fee: 0n,
    feeRecipient: zeroAddress,
    skimRecipient: zeroAddress,
    pendingTimelock: { validAt: 0n, value: 0n },
    pendingGuardian: { validAt: 0n, value: zeroAddress },
    pendingOwner: zeroAddress,
    timelock: 0n,
    supplyQueue: [...supplyQueue],
    withdrawQueue: [...withdrawQueue],
    publicAllocatorConfig: {
      fee,
      accruedFee: 0n,
      admin: zeroAddress,
    },
    totalSupply: parseUnits("1", 18),
    totalAssets,
    lastTotalAssets: totalAssets,
  });

const makeConfig = ({
  vault,
  marketId,
  cap,
  maxIn,
  maxOut,
}: {
  readonly vault: Address;
  readonly marketId: MarketId;
  readonly cap: bigint;
  readonly maxIn: bigint;
  readonly maxOut: bigint;
}) =>
  new VaultMarketConfig({
    vault,
    marketId,
    cap,
    pendingCap: { validAt: 0n, value: 0n },
    removableAt: 0n,
    enabled: true,
    publicAllocatorConfig: new VaultMarketPublicAllocatorConfig({
      vault,
      marketId,
      maxIn,
      maxOut,
    }),
  });

const makeFixture = () =>
  new ReallocationData({
    chainId: ChainId.EthMainnet,
    markets: {
      [marketA1.id]: marketA1,
      [marketA2.id]: marketA2,
      [marketA3.id]: marketA3,
      [marketB1.id]: marketB1,
      [marketB2.id]: marketB2,
    },
    positions: {
      [vaultA]: {
        [marketA1.id]: makePosition(
          vaultA,
          marketA1.id,
          parseUnits("1000", 12),
        ),
        [marketA2.id]: makePosition(vaultA, marketA2.id, parseUnits("400", 12)),
        [marketA3.id]: makePosition(vaultA, marketA3.id, 0n),
      },
      [vaultC]: {
        [marketA1.id]: makePosition(vaultC, marketA1.id, parseUnits("500", 12)),
        [marketA2.id]: makePosition(vaultC, marketA2.id, parseUnits("200", 12)),
        [marketA3.id]: makePosition(
          vaultC,
          marketA3.id,
          parseUnits("1000", 12),
        ),
      },
    },
    vaults: {
      [vaultA]: makeVault({
        address: vaultA,
        asset: tokenA,
        supplyQueue: [marketA1.id, marketA2.id],
        withdrawQueue: [marketA2.id, marketA1.id],
        fee: parseEther("0.005"),
        totalAssets: parseUnits("1400", 6),
      }),
      [vaultC]: makeVault({
        address: vaultC,
        asset: tokenA,
        supplyQueue: [marketA1.id, marketA2.id, marketA3.id],
        withdrawQueue: [marketA3.id, marketA2.id, marketA1.id],
        fee: parseEther("0.001"),
        totalAssets: parseUnits("1700", 6),
      }),
    },
    vaultMarketConfigs: {
      [vaultA]: {
        [marketA1.id]: makeConfig({
          vault: vaultA,
          marketId: marketA1.id,
          cap: parseUnits("1010", 6),
          maxIn: 0n,
          maxOut: parseUnits("100", 6),
        }),
        [marketA2.id]: makeConfig({
          vault: vaultA,
          marketId: marketA2.id,
          cap: parseUnits("500", 6),
          maxIn: parseUnits("40", 6),
          maxOut: 0n,
        }),
      },
      [vaultC]: {
        [marketA1.id]: makeConfig({
          vault: vaultC,
          marketId: marketA1.id,
          cap: parseUnits("900", 6),
          maxIn: parseUnits("350", 6),
          maxOut: parseUnits("350", 6),
        }),
        [marketA2.id]: makeConfig({
          vault: vaultC,
          marketId: marketA2.id,
          cap: parseUnits("400", 6),
          maxIn: parseUnits("200", 6),
          maxOut: parseUnits("200", 6),
        }),
        [marketA3.id]: makeConfig({
          vault: vaultC,
          marketId: marketA3.id,
          cap: parseUnits("1100", 6),
          maxIn: parseUnits("400", 6),
          maxOut: parseUnits("400", 6),
        }),
      },
    },
  } satisfies InputReallocationData);

const liquidity = (data: ReallocationData, marketId: MarketId) =>
  data.getMarket(marketId).liquidity;

describe("ReallocationData public allocator integration", () => {
  test.each([
    {
      marketId: marketA1.id,
      expectedWithdrawals: [
        { vault: vaultC, id: marketA3.id, assets: 300_000000n },
        { vault: vaultC, id: marketA2.id, assets: 50_000000n },
      ],
      expectedLiquidity: {
        [marketA1.id]: 1100_000000n,
        [marketA2.id]: 10150_000000n,
        [marketA3.id]: 0n,
      },
    },
    {
      marketId: marketA2.id,
      expectedWithdrawals: [
        { vault: vaultC, id: marketA3.id, assets: 200_000000n },
        { vault: vaultA, id: marketA1.id, assets: 40_000000n },
      ],
      expectedLiquidity: {
        [marketA1.id]: 710_000000n,
        [marketA2.id]: 10440_000000n,
        [marketA3.id]: 100_000000n,
      },
    },
    {
      marketId: marketA3.id,
      expectedWithdrawals: [
        { vault: vaultC, id: marketA2.id, assets: 100_000000n },
      ],
      expectedLiquidity: {
        [marketA1.id]: 750_000000n,
        [marketA2.id]: 10100_000000n,
        [marketA3.id]: 400_000000n,
      },
    },
  ])("matches 100% target utilization for $marketId", (scenario) => {
    const { withdrawals, data } = makeFixture().getMarketPublicReallocations(
      scenario.marketId,
      { defaultMaxWithdrawalUtilization: parseEther("1") },
    );

    expect(withdrawals).toEqual(scenario.expectedWithdrawals);
    for (const [marketId, expected] of Object.entries(
      scenario.expectedLiquidity,
    ) as [MarketId, bigint][]) {
      expect(liquidity(data, marketId)).toEqual(expected);
    }
  });

  test("matches caller-provided reallocatable vaults regardless of address casing", () => {
    const expected = makeFixture().getMarketPublicReallocations(marketA1.id, {
      defaultMaxWithdrawalUtilization: parseEther("1"),
    });
    const lowerCased = makeFixture().getMarketPublicReallocations(marketA1.id, {
      defaultMaxWithdrawalUtilization: parseEther("1"),
      reallocatableVaults: [
        vaultA.toLowerCase() as Address,
        vaultC.toLowerCase() as Address,
      ],
    });

    expect(lowerCased.withdrawals).toEqual(expected.withdrawals);
    expect(liquidity(lowerCased.data, marketA1.id)).toEqual(
      liquidity(expected.data, marketA1.id),
    );
  });

  test.each([
    marketB1.id,
    marketB2.id,
  ])("returns no withdrawals for non-reallocatable market %s", (marketId) => {
    const { withdrawals, data } = makeFixture().getMarketPublicReallocations(
      marketId,
      { defaultMaxWithdrawalUtilization: parseEther("1") },
    );

    expect(withdrawals).toEqual([]);
    expect(liquidity(data, marketId)).toEqual(parseEther("10000"));
  });

  test("moves idle-market liquidity when the target utilization is 0%", () => {
    const idleMarket = new Market({
      params: MarketParams.idle(tokenA),
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      totalSupplyAssets: parseUnits("100000", 6),
      totalSupplyShares: parseUnits("100000", 12),
      lastUpdate: timestamp,
      fee: 0n,
      price: parseUnits("3", 18),
    });
    const fixture = new ReallocationData({
      chainId: ChainId.EthMainnet,
      markets: {
        [idleMarket.id]: idleMarket,
        [marketA1.id]: marketA1,
      },
      positions: {
        [vaultA]: {
          [idleMarket.id]: makePosition(
            vaultA,
            idleMarket.id,
            parseUnits("10000", 12),
          ),
          [marketA1.id]: makePosition(vaultA, marketA1.id, 0n),
        },
      },
      vaults: {
        [vaultA]: makeVault({
          address: vaultA,
          asset: tokenA,
          supplyQueue: [idleMarket.id, marketA1.id],
          withdrawQueue: [idleMarket.id, marketA1.id],
          fee: 0n,
          totalAssets: parseUnits("10000", 6),
        }),
      },
      vaultMarketConfigs: {
        [vaultA]: {
          [idleMarket.id]: makeConfig({
            vault: vaultA,
            marketId: idleMarket.id,
            cap: parseUnits("10000", 6),
            maxIn: parseUnits("10000", 6),
            maxOut: parseUnits("10000", 6),
          }),
          [marketA1.id]: makeConfig({
            vault: vaultA,
            marketId: marketA1.id,
            cap: parseUnits("10000", 6),
            maxIn: parseUnits("10000", 6),
            maxOut: parseUnits("10000", 6),
          }),
        },
      },
    });

    const { withdrawals, data } = fixture.getMarketPublicReallocations(
      marketA1.id,
      { defaultMaxWithdrawalUtilization: 0n },
    );

    expect(withdrawals).toEqual([
      { vault: vaultA, id: idleMarket.id, assets: parseUnits("10000", 6) },
    ]);
    expect(liquidity(data, idleMarket.id)).toEqual(parseUnits("90000", 6));
    expect(liquidity(data, marketA1.id)).toEqual(
      liquidity(fixture, marketA1.id) + parseUnits("10000", 6),
    );
  });

  test.each([
    {
      marketId: marketA1.id,
      options: { defaultMaxWithdrawalUtilization: parseEther("0.9") },
      expectedWithdrawals: [
        { vault: vaultC, id: marketA2.id, assets: 200_000000n },
      ],
      expectedLiquidity: {
        [marketA1.id]: 950_000000n,
        [marketA2.id]: 10000_000000n,
        [marketA3.id]: marketA3.liquidity,
      },
    },
    {
      marketId: marketA1.id,
      options: {
        defaultMaxWithdrawalUtilization: parseEther("0.9"),
        maxWithdrawalUtilization: { [marketA2.id]: 49_8000000000000000n },
      },
      expectedWithdrawals: [
        { vault: vaultC, id: marketA2.id, assets: 119_678714n },
      ],
      expectedLiquidity: {
        [marketA1.id]: 869_678714n,
        [marketA2.id]: 10080_321286n,
        [marketA3.id]: marketA3.liquidity,
      },
    },
    {
      marketId: marketA2.id,
      options: { defaultMaxWithdrawalUtilization: parseEther("0.9") },
      expectedWithdrawals: [],
      expectedLiquidity: {
        [marketA1.id]: marketA1.liquidity,
        [marketA2.id]: marketA2.liquidity,
        [marketA3.id]: marketA3.liquidity,
      },
    },
    {
      marketId: marketA3.id,
      options: { defaultMaxWithdrawalUtilization: parseEther("0.9") },
      expectedWithdrawals: [
        { vault: vaultC, id: marketA2.id, assets: 100_000000n },
      ],
      expectedLiquidity: {
        [marketA1.id]: marketA1.liquidity,
        [marketA2.id]: 10100_000000n,
        [marketA3.id]: 400_000000n,
      },
    },
  ])("matches custom target utilization for $marketId", (scenario) => {
    const { withdrawals, data } = makeFixture().getMarketPublicReallocations(
      scenario.marketId,
      scenario.options,
    );

    expect(withdrawals).toEqual(scenario.expectedWithdrawals);
    for (const [marketId, expected] of Object.entries(
      scenario.expectedLiquidity,
    ) as [MarketId, bigint][]) {
      expect(liquidity(data, marketId)).toEqual(expected);
    }
  });

  test.each([
    marketA1.id,
    marketA2.id,
    marketA3.id,
  ])("returns no withdrawals with near-zero target utilization for %s", (marketId) => {
    const fixture = makeFixture();
    const { withdrawals, data } = fixture.getMarketPublicReallocations(
      marketId,
      { defaultMaxWithdrawalUtilization: 1n },
    );

    expect(withdrawals).toEqual([]);
    expect(liquidity(data, marketA1.id)).toEqual(
      liquidity(fixture, marketA1.id),
    );
    expect(liquidity(data, marketA2.id)).toEqual(
      liquidity(fixture, marketA2.id),
    );
    expect(liquidity(data, marketA3.id)).toEqual(
      liquidity(fixture, marketA3.id),
    );
  });
});
