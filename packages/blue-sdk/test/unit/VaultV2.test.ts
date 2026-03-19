import { Time } from "@morpho-org/morpho-ts";
import { randomAddress } from "@morpho-org/test/fixtures";
import { type Address, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  AccrualPosition,
  AccrualVault,
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1Adapter,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  AccrualVaultV2MorphoVaultV1Adapter,
  type IAccrualVaultV2Adapter,
  Market,
  type MarketId,
  MathLib,
} from "../../src/index.js";

const timestamp = Time.timestamp();

// SharesMath.VIRTUAL_SHARES = 1_000_000n.
// With totalSupplyShares = totalSupplyAssets * SHARES_FACTOR,
// toSupplyAssets(N * SHARES_FACTOR) = N exactly.
const SHARES_FACTOR = 1_000_000n;

function createMarket(
  totalSupplyAssets: bigint,
  totalBorrowAssets: bigint,
): Market {
  return new Market({
    params: {
      collateralToken: randomAddress(),
      loanToken: randomAddress(),
      oracle: randomAddress(),
      irm: randomAddress(),
      lltv: 86_0000000000000000n,
    },
    totalSupplyAssets,
    totalBorrowAssets,
    totalSupplyShares: totalSupplyAssets * SHARES_FACTOR,
    totalBorrowShares: totalBorrowAssets * SHARES_FACTOR,
    rateAtTarget: 0n,
    lastUpdate: timestamp,
    fee: 0n,
  });
}

function makeMarketV1Adapter(
  parentVault: Address,
  markets: Market[],
  supplyAmounts: bigint[],
) {
  return new AccrualVaultV2MorphoMarketV1Adapter(
    {
      address: randomAddress(),
      parentVault,
      skimRecipient: zeroAddress,
      marketParamsList: markets.map((m) => m.params),
    },
    markets.map(
      (market, i) =>
        new AccrualPosition(
          {
            supplyShares: supplyAmounts[i]! * SHARES_FACTOR,
            borrowShares: 0n,
            collateral: 0n,
            user: parentVault,
          },
          market,
        ),
    ),
  );
}

function makeMarketV1V2Adapter(
  parentVault: Address,
  markets: Market[],
  supplyAmounts: bigint[],
) {
  const supplyShares = {} as Record<MarketId, bigint>;
  for (let i = 0; i < markets.length; i++) {
    supplyShares[markets[i]!.id] = supplyAmounts[i]! * SHARES_FACTOR;
  }
  return new AccrualVaultV2MorphoMarketV1AdapterV2(
    {
      address: randomAddress(),
      parentVault,
      skimRecipient: zeroAddress,
      marketIds: markets.map((m) => m.id),
      adaptiveCurveIrm: markets[0]!.params.irm,
      supplyShares,
    },
    markets,
  );
}

function makeAccrualVaultV1(markets: Market[], supplyAmounts: bigint[]) {
  const vaultAddr = randomAddress();
  const totalAssets = supplyAmounts.reduce((a, b) => a + b, 0n);
  return new AccrualVault(
    {
      address: vaultAddr,
      asset: markets[0]!.params.loanToken,
      decimalsOffset: 6n,
      totalSupply: totalAssets * SHARES_FACTOR,
      lastTotalAssets: totalAssets,
      supplyQueue: markets.map((m) => m.id),
      owner: randomAddress(),
      curator: randomAddress(),
      fee: 0n,
      feeRecipient: randomAddress(),
      skimRecipient: randomAddress(),
      guardian: randomAddress(),
      pendingGuardian: { value: randomAddress(), validAt: 0n },
      pendingOwner: randomAddress(),
      pendingTimelock: { value: 0n, validAt: 0n },
      timelock: 0n,
    },
    markets.map((market, i) => ({
      config: {
        cap: MathLib.MAX_UINT_256,
        enabled: true,
        marketId: market.id,
        pendingCap: { value: 0n, validAt: 0n },
        removableAt: 0n,
        vault: vaultAddr,
      },
      position: new AccrualPosition(
        {
          supplyShares: supplyAmounts[i]! * SHARES_FACTOR,
          borrowShares: 0n,
          collateral: 0n,
          user: vaultAddr,
        },
        market,
      ),
    })),
  );
}

function makeVaultV1Adapter(
  parentVault: Address,
  accrualVaultV1: AccrualVault,
) {
  return new AccrualVaultV2MorphoVaultV1Adapter(
    {
      address: randomAddress(),
      parentVault,
      skimRecipient: zeroAddress,
      morphoVaultV1: accrualVaultV1.address,
    },
    accrualVaultV1,
    accrualVaultV1.totalSupply,
  );
}

function makeVaultV2(opts: {
  adapters: IAccrualVaultV2Adapter[];
  liqAdapter?: IAccrualVaultV2Adapter;
  penalties: Record<Address, bigint>;
  assetBalance?: bigint;
}) {
  return new AccrualVaultV2(
    {
      address: randomAddress(),
      asset: randomAddress(),
      totalAssets: 1_000_000n,
      _totalAssets: 1_000_000n,
      totalSupply: 1_000_000_000_000n,
      virtualShares: SHARES_FACTOR,
      maxRate: 0n,
      lastUpdate: timestamp,
      liquidityAdapter: opts.liqAdapter?.address ?? zeroAddress,
      liquidityData: "0x",
      liquidityAllocations: undefined,
      performanceFee: 0n,
      managementFee: 0n,
      performanceFeeRecipient: zeroAddress,
      managementFeeRecipient: zeroAddress,
    },
    opts.liqAdapter,
    opts.adapters,
    opts.assetBalance ?? 0n,
    opts.penalties,
  );
}

describe("VaultV2 maxForceDeallocate", () => {
  test("should exclude adapters with non-zero force-deallocate penalties", () => {
    const marketA = createMarket(10_000n, 2_000n); // liquidity = 8_000
    const marketB = createMarket(20_000n, 5_000n); // liquidity = 15_000

    const vaultAddr = randomAddress();
    const adapter1 = makeMarketV1Adapter(vaultAddr, [marketA], [3_000n]);
    const adapter2 = makeMarketV1Adapter(vaultAddr, [marketB], [5_000n]);

    const vault = makeVaultV2({
      adapters: [adapter1, adapter2],
      penalties: {
        [adapter1.address]: 0n,
        [adapter2.address]: MathLib.WAD, // 1e18 non-zero penalty
      },
    });

    const result = vault.maxForceDeallocate();

    expect(result.totalValue).toBe(3_000n);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toStrictEqual({
      adapter: adapter1.address,
      amount: 3_000n,
      marketParams: marketA.params,
    });
  });

  test("should compute correct totalValue and actions for MarketV1 and MarketV1V2 adapters", () => {
    const marketA = createMarket(10_000n, 2_000n); // liquidity = 8_000
    const marketC = createMarket(50_000n, 40_000n); // liquidity = 10_000

    const vaultAddr = randomAddress();
    const adapter1 = makeMarketV1Adapter(vaultAddr, [marketA], [3_000n]);
    const adapter3 = makeMarketV1V2Adapter(vaultAddr, [marketC], [7_000n]);

    const vault = makeVaultV2({
      adapters: [adapter1, adapter3],
      penalties: {
        [adapter1.address]: 0n,
        [adapter3.address]: 0n,
      },
    });

    const result = vault.maxForceDeallocate();

    expect(result.totalValue).toBe(10_000n);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toStrictEqual({
      adapter: adapter1.address,
      amount: 3_000n,
      marketParams: marketA.params,
    });
    expect(result.actions[1]).toStrictEqual({
      adapter: adapter3.address,
      amount: 7_000n,
      marketParams: marketC.params,
    });
  });

  test("should subtract MarketV1 liquidity adapter supply from available liquidity", () => {
    // Market A: liquidity = 8_000
    const marketA = createMarket(10_000n, 2_000n);

    const vaultAddr = randomAddress();
    const adapter1 = makeMarketV1Adapter(vaultAddr, [marketA], [3_000n]);
    const liqAdapter = makeMarketV1Adapter(vaultAddr, [marketA], [6_000n]);

    const vault = makeVaultV2({
      adapters: [adapter1],
      liqAdapter,
      penalties: {
        [adapter1.address]: 0n,
      },
    });

    const result = vault.maxForceDeallocate();

    // Available after subtraction: 8_000 - 6_000 = 2_000
    // Deallocatable: min(adapter1 supply=3_000, available=2_000) = 2_000
    expect(result.totalValue).toBe(2_000n);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toStrictEqual({
      adapter: adapter1.address,
      amount: 2_000n,
      marketParams: marketA.params,
    });
  });

  test("should subtract MarketV1V2 liquidity adapter supply from available liquidity", () => {
    const marketA = createMarket(10_000n, 2_000n); // liquidity = 8_000

    const vaultAddr = randomAddress();
    const adapter1 = makeMarketV1Adapter(vaultAddr, [marketA], [3_000n]);
    const liqAdapter = makeMarketV1V2Adapter(vaultAddr, [marketA], [6_000n]);

    const vault = makeVaultV2({
      adapters: [adapter1],
      liqAdapter,
      penalties: {
        [adapter1.address]: 0n,
      },
    });

    const result = vault.maxForceDeallocate();

    // Available after subtraction: 8_000 - 6_000 = 2_000
    expect(result.totalValue).toBe(2_000n);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toStrictEqual({
      adapter: adapter1.address,
      amount: 2_000n,
      marketParams: marketA.params,
    });
  });

  test("should subtract VaultV1 liquidity adapter supply from available liquidity", () => {
    const marketA = createMarket(10_000n, 2_000n); // liquidity = 8_000

    const vaultAddr = randomAddress();
    const adapter1 = makeMarketV1Adapter(vaultAddr, [marketA], [3_000n]);
    const liqVaultV1 = makeAccrualVaultV1([marketA], [6_000n]);
    const liqAdapter = makeVaultV1Adapter(vaultAddr, liqVaultV1);

    const vault = makeVaultV2({
      adapters: [adapter1],
      liqAdapter,
      penalties: {
        [adapter1.address]: 0n,
      },
    });

    const result = vault.maxForceDeallocate();

    // VaultV1 liquidity adapter has 6_000 supplied to marketA
    // Available: 8_000 - 6_000 = 2_000
    expect(result.totalValue).toBe(2_000n);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toStrictEqual({
      adapter: adapter1.address,
      amount: 2_000n,
      marketParams: marketA.params,
    });
  });

  test("should only reserve VaultV1 liquidity adapter's pro-rata share, not the full MetaMorpho position", () => {
    const marketA = createMarket(10_000n, 2_000n); // liquidity = 8_000

    const vaultAddr = randomAddress();
    const adapter1 = makeMarketV1Adapter(vaultAddr, [marketA], [3_000n]);

    // MetaMorpho has 6_000 on marketA, but the liquidity adapter holds only half
    const liqVaultV1 = makeAccrualVaultV1([marketA], [6_000n]);
    const liqAdapter = new AccrualVaultV2MorphoVaultV1Adapter(
      {
        address: randomAddress(),
        parentVault: vaultAddr,
        skimRecipient: zeroAddress,
        morphoVaultV1: liqVaultV1.address,
      },
      liqVaultV1,
      liqVaultV1.totalSupply / 2n, // half the shares → claim = 3_000
    );

    const vault = makeVaultV2({
      adapters: [adapter1],
      liqAdapter,
      penalties: {
        [adapter1.address]: 0n,
      },
    });

    const result = vault.maxForceDeallocate();

    // Adapter holds half the MetaMorpho shares → claim = 3_000
    // Reserved from marketA: min(6_000, 8_000, 3_000) = 3_000
    // Available: 8_000 - 3_000 = 5_000
    // Deallocatable: min(adapter1 supply=3_000, available=5_000) = 3_000
    expect(result.totalValue).toBe(3_000n);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toStrictEqual({
      adapter: adapter1.address,
      amount: 3_000n,
      marketParams: marketA.params,
    });
  });

  test("should not over-reserve later-queue markets when early-queue markets cover the VaultV1 liquidity adapter withdrawal", () => {
    const marketA = createMarket(10_000n, 2_000n); // liquidity = 8_000
    const marketB = createMarket(20_000n, 5_000n); // liquidity = 15_000

    const vaultAddr = randomAddress();
    const adapter1 = makeMarketV1Adapter(vaultAddr, [marketB], [4_000n]);

    // MetaMorpho has positions on both markets, withdraw queue [A, B].
    // Adapter holds all shares, total claim = 5_000.
    // Market A alone (supply=3_000) covers only part, so 2_000 reserved from B.
    const liqVaultV1 = makeAccrualVaultV1([marketA, marketB], [3_000n, 2_000n]);
    const liqAdapter = makeVaultV1Adapter(vaultAddr, liqVaultV1);

    const vault = makeVaultV2({
      adapters: [adapter1],
      liqAdapter,
      penalties: {
        [adapter1.address]: 0n,
      },
    });

    const result = vault.maxForceDeallocate();

    // Walk queue: remaining = 5_000
    //   A: min(3_000, 8_000, 5_000) = 3_000, remaining = 2_000
    //   B: min(2_000, 15_000, 2_000) = 2_000, remaining = 0
    // Available B: 15_000 - 2_000 = 13_000
    // Deallocatable: min(adapter1 supply=4_000, available=13_000) = 4_000
    expect(result.totalValue).toBe(4_000n);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toStrictEqual({
      adapter: adapter1.address,
      amount: 4_000n,
      marketParams: marketB.params,
    });
  });

  test("should handle VaultV1 adapter respecting withdraw queue order", () => {
    const marketD = createMarket(10_000n, 7_000n); // liquidity = 3_000
    const marketE = createMarket(20_000n, 10_000n); // liquidity = 10_000

    const vaultAddr = randomAddress();
    // VaultV1 has positions [D=4_000, E=6_000], total=10_000.
    // Withdraw queue: [D, E].
    const accrualVaultV1 = makeAccrualVaultV1(
      [marketD, marketE],
      [4_000n, 6_000n],
    );
    const vaultV1Adapter = makeVaultV1Adapter(vaultAddr, accrualVaultV1);

    const vault = makeVaultV2({
      adapters: [vaultV1Adapter],
      penalties: {
        [vaultV1Adapter.address]: 0n,
      },
    });

    const result = vault.maxForceDeallocate();

    // targetAssets = vaultV1.toAssets(allShares) = 10_000
    //
    // Process D first (withdraw queue order):
    //   canWithdraw = min(supply=4_000, liquidity=3_000, remaining=10_000) = 3_000
    //   remaining = 7_000
    //
    // Process E:
    //   canWithdraw = min(supply=6_000, liquidity=10_000, remaining=7_000) = 6_000
    //   remaining = 1_000
    //
    // amount = 10_000 - 1_000 = 9_000
    expect(result.totalValue).toBe(9_000n);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toStrictEqual({
      adapter: vaultV1Adapter.address,
      amount: 9_000n,
    });
  });

  test("should track shared market liquidity across MarketV1 and VaultV1 adapters", () => {
    const marketF = createMarket(10_000n, 5_000n); // liquidity = 5_000

    const vaultAddr = randomAddress();
    const accrualVaultV1 = makeAccrualVaultV1([marketF], [3_000n]);
    const vaultV1Adapter = makeVaultV1Adapter(vaultAddr, accrualVaultV1);
    const marketV1Adapter = makeMarketV1Adapter(vaultAddr, [marketF], [4_000n]);

    const vault = makeVaultV2({
      adapters: [vaultV1Adapter, marketV1Adapter],
      penalties: {
        [vaultV1Adapter.address]: 0n,
        [marketV1Adapter.address]: 0n,
      },
    });

    const result = vault.maxForceDeallocate();

    // VaultV1 adapters processed first:
    //   targetAssets = 3_000, remaining = 3_000
    //   F: canWithdraw = min(supply=3_000, liquidity=5_000, remaining=3_000) = 3_000
    //   remaining = 0, available F = 5_000 - 3_000 = 2_000
    //   amount = 3_000
    //
    // MarketV1 adapter:
    //   F: amount = min(supply=4_000, available=2_000) = 2_000
    //
    // total = 3_000 + 2_000 = 5_000
    expect(result.totalValue).toBe(5_000n);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toStrictEqual({
      adapter: marketV1Adapter.address,
      amount: 4_000n,
      marketParams: marketF.params,
    });
    expect(result.actions[1]).toStrictEqual({
      adapter: vaultV1Adapter.address,
      amount: 1_000n,
    });
  });

  test("should return empty result when all adapters have non-zero penalties", () => {
    const marketA = createMarket(10_000n, 2_000n);

    const vaultAddr = randomAddress();
    const adapter1 = makeMarketV1Adapter(vaultAddr, [marketA], [3_000n]);
    const adapter2 = makeMarketV1Adapter(vaultAddr, [marketA], [2_000n]);

    const vault = makeVaultV2({
      adapters: [adapter1, adapter2],
      penalties: {
        [adapter1.address]: MathLib.WAD,
        [adapter2.address]: 500_000_000_000_000_000n,
      },
    });

    const result = vault.maxForceDeallocate();

    expect(result.totalValue).toBe(0n);
    expect(result.actions).toHaveLength(0);
  });

  test("should cap deallocatable amount by market liquidity", () => {
    // Market with very low liquidity relative to adapter supply
    const market = createMarket(100_000n, 99_000n); // liquidity = 1_000

    const vaultAddr = randomAddress();
    const adapter = makeMarketV1Adapter(vaultAddr, [market], [50_000n]);

    const vault = makeVaultV2({
      adapters: [adapter],
      penalties: {
        [adapter.address]: 0n,
      },
    });

    const result = vault.maxForceDeallocate();

    // supply = 50_000, but liquidity = 1_000, so capped at 1_000
    expect(result.totalValue).toBe(1_000n);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toStrictEqual({
      adapter: adapter.address,
      amount: 1_000n,
      marketParams: market.params,
    });
  });

  test("should handle adapter with multiple markets independently", () => {
    const marketX = createMarket(10_000n, 2_000n); // liquidity = 8_000
    const marketY = createMarket(5_000n, 4_000n); // liquidity = 1_000

    const vaultAddr = randomAddress();
    // Single MarketV1 adapter with positions on both markets
    const adapter = makeMarketV1Adapter(
      vaultAddr,
      [marketX, marketY],
      [3_000n, 2_000n],
    );

    const vault = makeVaultV2({
      adapters: [adapter],
      penalties: {
        [adapter.address]: 0n,
      },
    });

    const result = vault.maxForceDeallocate();

    // X: min(supply=3_000, liquidity=8_000) = 3_000
    // Y: min(supply=2_000, liquidity=1_000) = 1_000
    // total = 4_000
    expect(result.totalValue).toBe(4_000n);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toStrictEqual({
      adapter: adapter.address,
      amount: 3_000n,
      marketParams: marketX.params,
    });
    expect(result.actions[1]).toStrictEqual({
      adapter: adapter.address,
      amount: 1_000n,
      marketParams: marketY.params,
    });
  });

  test("should floor liquidity at zero when liquidity adapter supply exceeds market liquidity", () => {
    // Market liquidity = 3_000
    const market = createMarket(10_000n, 7_000n);

    const vaultAddr = randomAddress();
    const adapter = makeMarketV1Adapter(vaultAddr, [market], [5_000n]);
    // Liquidity adapter supply = 5_000 > market liquidity = 3_000
    const liqAdapter = makeMarketV1Adapter(vaultAddr, [market], [5_000n]);

    const vault = makeVaultV2({
      adapters: [adapter],
      liqAdapter,
      penalties: {
        [adapter.address]: 0n,
      },
    });

    const result = vault.maxForceDeallocate();

    // Available: zeroFloorSub(3_000, 5_000) = 0
    expect(result.totalValue).toBe(0n);
    expect(result.actions).toHaveLength(0);
  });
});
