import { randomAddress } from "@morpho-org/test/fixtures";
import { type Address, type Hash, type Hex, zeroHash } from "viem";
import { describe, expect, test } from "vitest";
import type { BigIntish, MarketId } from "../../src/types.js";
import { CapacityLimitReason } from "../../src/utils.js";
import { AccrualVaultV2 } from "../../src/vault/v2/VaultV2.js";
import type {
  IAccrualVaultV2Adapter,
  MarketDeallocatableData,
} from "../../src/vault/v2/VaultV2Adapter.js";

const marketId1 =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as MarketId;
const marketId2 =
  "0x0000000000000000000000000000000000000000000000000000000000000002" as MarketId;

class MockAdapter implements IAccrualVaultV2Adapter {
  address: Address;
  parentVault: Address;
  adapterId: Hash;
  skimRecipient: Address;

  constructor(
    address: Address,
    private _deallocatable: Map<MarketId, MarketDeallocatableData>,
    private _maxWithdrawValue = 0n,
  ) {
    this.address = address;
    this.parentVault = randomAddress();
    this.adapterId = zeroHash;
    this.skimRecipient = randomAddress();
  }

  realAssets(_timestamp?: BigIntish) {
    return 0n;
  }

  maxDeposit(_data: Hex, assets: BigIntish) {
    return { value: BigInt(assets), limiter: CapacityLimitReason.balance };
  }

  maxWithdraw(_data: Hex) {
    return {
      value: this._maxWithdrawValue,
      limiter: CapacityLimitReason.balance,
    };
  }

  maxDeallocatableAssets() {
    return new Map(this._deallocatable);
  }
}

function makeVault({
  assetBalance = 0n,
  totalAssets = 999n,
  totalSupply = 1000n,
  liquidityAdapterAddress,
  accrualLiquidityAdapter,
  adapters,
  penalties,
}: {
  assetBalance?: bigint;
  totalAssets?: bigint;
  totalSupply?: bigint;
  liquidityAdapterAddress?: Address;
  accrualLiquidityAdapter?: IAccrualVaultV2Adapter;
  adapters: IAccrualVaultV2Adapter[];
  penalties: Record<Address, bigint>;
}) {
  const liqAddr = liquidityAdapterAddress ?? randomAddress();
  return new AccrualVaultV2(
    {
      address: randomAddress(),
      asset: randomAddress(),
      totalAssets,
      _totalAssets: totalAssets,
      totalSupply,
      virtualShares: 0n,
      maxRate: 0n,
      lastUpdate: 0n,
      liquidityAdapter: liqAddr,
      liquidityData: "0x" as Hex,
      liquidityAllocations: undefined,
      performanceFee: 0n,
      managementFee: 0n,
      performanceFeeRecipient: randomAddress(),
      managementFeeRecipient: randomAddress(),
    },
    accrualLiquidityAdapter,
    adapters,
    assetBalance,
    penalties,
  );
}

describe("VaultV2 maxForceWithdraw – same market across multiple adapters", () => {
  test("should aggregate supplyAssets from two adapters on the same market", () => {
    const addrA = randomAddress();
    const addrB = randomAddress();
    const adapterA = new MockAdapter(
      addrA,
      new Map([[marketId1, { supplyAssets: 200n, liquidity: 1000n }]]),
    );
    const adapterB = new MockAdapter(
      addrB,
      new Map([[marketId1, { supplyAssets: 300n, liquidity: 1000n }]]),
    );

    const vault = makeVault({
      assetBalance: 100n,
      adapters: [adapterA, adapterB],
      penalties: { [addrA]: 0n, [addrB]: 0n },
    });

    // shares = 500 → assets = 500 (1:1 ratio)
    // maxWithdraw: liquidity = assetBalance = 100, assets = 500 > 100 → limited
    // forceDeallocatable = min(1000, 200+300) = 500
    // totalLiquidity = 100 + 500 = 600
    // assets = 500 <= 600 → capped by balance
    const result = vault.maxForceWithdraw(500n);
    expect(result.value).toBe(500n);
    expect(result.limiter).toBe(
      CapacityLimitReason.vaultV2_forceDeallocateBalance,
    );
  });

  test("should cap at market liquidity when aggregated supply exceeds it", () => {
    const addrA = randomAddress();
    const addrB = randomAddress();
    const adapterA = new MockAdapter(
      addrA,
      new Map([[marketId1, { supplyAssets: 200n, liquidity: 300n }]]),
    );
    const adapterB = new MockAdapter(
      addrB,
      new Map([[marketId1, { supplyAssets: 300n, liquidity: 300n }]]),
    );

    const vault = makeVault({
      assetBalance: 100n,
      adapters: [adapterA, adapterB],
      penalties: { [addrA]: 0n, [addrB]: 0n },
    });

    // forceDeallocatable = min(300, 500) = 300
    // totalLiquidity = 100 + 300 = 400
    // shares = 600 → assets = 600 > 400 → limited by force liquidity
    const result = vault.maxForceWithdraw(600n);
    expect(result.value).toBe(400n);
    expect(result.limiter).toBe(
      CapacityLimitReason.vaultV2_forceDeallocateLiquidity,
    );
  });

  test("should only include adapters whose penalty <= maxPenalty", () => {
    const addrA = randomAddress();
    const addrB = randomAddress();
    const adapterA = new MockAdapter(
      addrA,
      new Map([[marketId1, { supplyAssets: 200n, liquidity: 1000n }]]),
    );
    const adapterB = new MockAdapter(
      addrB,
      new Map([[marketId1, { supplyAssets: 300n, liquidity: 1000n }]]),
    );

    const vault = makeVault({
      assetBalance: 100n,
      adapters: [adapterA, adapterB],
      penalties: { [addrA]: 0n, [addrB]: 1n },
    });

    // maxPenalty = 0 → only adapterA eligible
    // forceDeallocatable = min(1000, 200) = 200
    // totalLiquidity = 100 + 200 = 300
    // shares = 250 → assets = 250 <= 300
    const result = vault.maxForceWithdraw(250n, 0n);
    expect(result.value).toBe(250n);
    expect(result.limiter).toBe(
      CapacityLimitReason.vaultV2_forceDeallocateBalance,
    );

    // shares = 400 → assets = 400 > 300
    const result2 = vault.maxForceWithdraw(400n, 0n);
    expect(result2.value).toBe(300n);
    expect(result2.limiter).toBe(
      CapacityLimitReason.vaultV2_forceDeallocateLiquidity,
    );

    // maxPenalty = 1 → both adapters eligible
    // forceDeallocatable = min(1000, 500) = 500
    // totalLiquidity = 100 + 500 = 600
    // shares = 400 → assets = 400 <= 600
    const result3 = vault.maxForceWithdraw(400n, 1n);
    expect(result3.value).toBe(400n);
    expect(result3.limiter).toBe(
      CapacityLimitReason.vaultV2_forceDeallocateBalance,
    );
  });

  test("should handle same market in two adapters alongside a different market", () => {
    const addrA = randomAddress();
    const addrB = randomAddress();
    const adapterA = new MockAdapter(
      addrA,
      new Map([
        [marketId1, { supplyAssets: 200n, liquidity: 300n }],
        [marketId2, { supplyAssets: 100n, liquidity: 200n }],
      ]),
    );
    const adapterB = new MockAdapter(
      addrB,
      new Map([[marketId1, { supplyAssets: 300n, liquidity: 300n }]]),
    );

    const vault = makeVault({
      assetBalance: 50n,
      adapters: [adapterA, adapterB],
      penalties: { [addrA]: 0n, [addrB]: 0n },
    });

    // M1: aggregated supply = 500, liquidity = 300 → min = 300
    // M2: supply = 100, liquidity = 200 → min = 100
    // forceDeallocatable = 300 + 100 = 400
    // totalLiquidity = 50 + 400 = 450
    // shares = 450 → assets = 450 == 450
    const result = vault.maxForceWithdraw(450n);
    expect(result.value).toBe(450n);
    expect(result.limiter).toBe(
      CapacityLimitReason.vaultV2_forceDeallocateBalance,
    );

    // shares = 500 → assets = 500 > 450
    const result2 = vault.maxForceWithdraw(500n);
    expect(result2.value).toBe(450n);
    expect(result2.limiter).toBe(
      CapacityLimitReason.vaultV2_forceDeallocateLiquidity,
    );
  });

  test("should subtract liquidity adapter contribution to avoid double-counting", () => {
    const liqAddrAdapter = randomAddress();
    const addrB = randomAddress();

    const liquidityAdapter = new MockAdapter(
      liqAddrAdapter,
      new Map([[marketId1, { supplyAssets: 400n, liquidity: 1000n }]]),
      200n,
    );
    const adapterB = new MockAdapter(
      addrB,
      new Map([[marketId1, { supplyAssets: 300n, liquidity: 1000n }]]),
    );

    const vault = makeVault({
      assetBalance: 50n,
      liquidityAdapterAddress: liqAddrAdapter,
      accrualLiquidityAdapter: liquidityAdapter,
      adapters: [liquidityAdapter, adapterB],
      penalties: { [liqAddrAdapter]: 0n, [addrB]: 0n },
    });

    // maxWithdraw: liquidity = 50 + 200 = 250
    // shares = 800 → assets = 800 > 250 → limited, value = 250

    // Force deallocation:
    // M1: aggregated supply = 400 + 300 = 700, liquidity = 1000
    // forceDeallocatable = min(1000, 700) = 700
    // liquidityAdapterIncluded = true → subtract liquidityAdapter.maxWithdraw = 200
    // forceDeallocatable = 700 - 200 = 500
    // totalLiquidity = 250 + 500 = 750
    // assets = 800 > 750
    const result = vault.maxForceWithdraw(800n);
    expect(result.value).toBe(750n);
    expect(result.limiter).toBe(
      CapacityLimitReason.vaultV2_forceDeallocateLiquidity,
    );

    // shares = 700 → assets = 700 <= 750
    const result2 = vault.maxForceWithdraw(700n);
    expect(result2.value).toBe(700n);
    expect(result2.limiter).toBe(
      CapacityLimitReason.vaultV2_forceDeallocateBalance,
    );
  });

  test("should use first adapter's liquidity when same market appears across adapters", () => {
    const addrA = randomAddress();
    const addrB = randomAddress();

    // Adapters report different liquidity for the same market.
    // The aggregation keeps the first adapter's liquidity value.
    const adapterA = new MockAdapter(
      addrA,
      new Map([[marketId1, { supplyAssets: 100n, liquidity: 400n }]]),
    );
    const adapterB = new MockAdapter(
      addrB,
      new Map([[marketId1, { supplyAssets: 100n, liquidity: 9999n }]]),
    );

    const vault = makeVault({
      assetBalance: 0n,
      adapters: [adapterA, adapterB],
      penalties: { [addrA]: 0n, [addrB]: 0n },
    });

    // M1: aggregated supply = 200, liquidity = 400 (from adapterA, first seen)
    // forceDeallocatable = min(400, 200) = 200
    // totalLiquidity = 0 + 200 = 200
    const result = vault.maxForceWithdraw(200n);
    expect(result.value).toBe(200n);
    expect(result.limiter).toBe(
      CapacityLimitReason.vaultV2_forceDeallocateBalance,
    );
  });

  test("should skip adapters with undefined penalty", () => {
    const addrA = randomAddress();
    const addrB = randomAddress();
    const adapterA = new MockAdapter(
      addrA,
      new Map([[marketId1, { supplyAssets: 200n, liquidity: 1000n }]]),
    );
    const adapterB = new MockAdapter(
      addrB,
      new Map([[marketId1, { supplyAssets: 300n, liquidity: 1000n }]]),
    );

    const vault = makeVault({
      assetBalance: 100n,
      adapters: [adapterA, adapterB],
      penalties: { [addrA]: 0n },
    });

    // adapterB has no penalty entry → skipped
    // forceDeallocatable = min(1000, 200) = 200
    // totalLiquidity = 100 + 200 = 300
    // shares = 400 → assets = 400 > 300
    const result = vault.maxForceWithdraw(400n);
    expect(result.value).toBe(300n);
    expect(result.limiter).toBe(
      CapacityLimitReason.vaultV2_forceDeallocateLiquidity,
    );
  });

  test("should return maxWithdraw result when not liquidity-limited", () => {
    const addrA = randomAddress();
    const adapterA = new MockAdapter(
      addrA,
      new Map([[marketId1, { supplyAssets: 200n, liquidity: 1000n }]]),
    );

    const vault = makeVault({
      assetBalance: 5000n,
      adapters: [adapterA],
      penalties: { [addrA]: 0n },
    });

    // maxWithdraw: liquidity = 5000, shares = 100 → assets = 100 <= 5000 → balance-limited
    // maxForceWithdraw returns maxWithdraw result directly
    const result = vault.maxForceWithdraw(100n);
    expect(result.value).toBe(100n);
    expect(result.limiter).toBe(CapacityLimitReason.balance);
  });
});
