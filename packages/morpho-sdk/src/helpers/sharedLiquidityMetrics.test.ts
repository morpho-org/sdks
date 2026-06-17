import {
  Market,
  type MarketId,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { type Address, parseEther } from "viem";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcBlue, WethUsdsBlue } from "../../test/fixtures/blue.js";
import type { ReallocationData } from "../entities/reallocationData.js";
import type { PublicAllocatorOptions } from "../types/index.js";
import {
  computeAvailableSharedLiquidity,
  computeLiquidityToTargetUtilization,
} from "./sharedLiquidityMetrics.js";

// --- Constants ---

const VAULT_A: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TIMESTAMP = 1_700_000_000n;

// --- Market fixtures ---

const targetParams = new MarketParams(WethUsdsBlue);
const sourceParamsA = new MarketParams(CbbtcUsdcBlue);

/** Builds a target Market with configurable supply/borrow. Uses TIMESTAMP as lastUpdate. */
function makeMarket(overrides?: {
  totalSupplyAssets?: bigint;
  totalBorrowAssets?: bigint;
}) {
  return new Market({
    params: targetParams,
    totalSupplyAssets: overrides?.totalSupplyAssets ?? 1000n * MathLib.WAD,
    totalBorrowAssets: overrides?.totalBorrowAssets ?? 500n * MathLib.WAD,
    totalSupplyShares: 1000n * MathLib.WAD,
    totalBorrowShares: 500n * MathLib.WAD,
    lastUpdate: TIMESTAMP,
    fee: 0n,
    price: 10n ** 36n,
  });
}

// --- Mock builder ---

interface MockStateParams {
  readonly targetMarket?: Market;
  readonly withdrawals?: ReadonlyArray<{
    id: MarketId;
    vault: Address;
    assets: bigint;
  }>;
  /** Captures the options passed to `getMarketPublicReallocations` for assertions. */
  readonly onReallocations?: (options?: PublicAllocatorOptions) => void;
}

/**
 * Creates a minimal mock ReallocationData.
 *
 * Only implements the methods the metric helpers call: `getMarket` and
 * `getMarketPublicReallocations`. The discovery algorithm itself is covered by
 * `reallocationData.test.ts`; here we mock its output to test the metric math.
 */
function makeMockState({
  targetMarket = makeMarket(),
  withdrawals = [],
  onReallocations,
}: MockStateParams = {}): ReallocationData {
  return {
    getMarket: (id: MarketId) => {
      if (id !== targetMarket.id) throw new Error(`Mock: unknown market ${id}`);
      return targetMarket;
    },
    getMarketPublicReallocations: (
      _id: MarketId,
      options?: PublicAllocatorOptions,
    ) => {
      onReallocations?.(options);
      return {
        withdrawals: options?.enabled === false ? [] : [...withdrawals],
        data: {} as ReallocationData,
      };
    },
  } as unknown as ReallocationData;
}

// ---------------------------------------------------------------------------

describe("computeAvailableSharedLiquidity", () => {
  test("default", () => {
    const data = makeMockState({
      withdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 120n * MathLib.WAD },
        { id: sourceParamsA.id, vault: VAULT_A, assets: 80n * MathLib.WAD },
      ],
    });

    const available = computeAvailableSharedLiquidity({
      reallocationData: data,
      marketId: targetParams.id,
    });

    expect(available).toBe(200n * MathLib.WAD);
  });

  test("behavior: returns 0n when no reallocatable liquidity", () => {
    const data = makeMockState({ withdrawals: [] });

    expect(
      computeAvailableSharedLiquidity({
        reallocationData: data,
        marketId: targetParams.id,
      }),
    ).toBe(0n);
  });

  test("behavior: returns 0n when discovery is disabled", () => {
    const data = makeMockState({
      withdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
      ],
    });

    expect(
      computeAvailableSharedLiquidity({
        reallocationData: data,
        marketId: targetParams.id,
        options: { enabled: false },
      }),
    ).toBe(0n);
  });
});

describe("computeLiquidityToTargetUtilization", () => {
  test("default: own headroom + shared liquidity", () => {
    // 1000 supply, 850 borrow (85% util). target 90%, supplyTarget 90% (not >).
    // ownHeadroom = 1000 * 0.9 - 850 = 50. shared = 200. → 250.
    const data = makeMockState({
      targetMarket: makeMarket({
        totalSupplyAssets: 1000n * MathLib.WAD,
        totalBorrowAssets: 850n * MathLib.WAD,
      }),
      withdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
      ],
    });

    const available = computeLiquidityToTargetUtilization({
      reallocationData: data,
      marketId: targetParams.id,
      targetUtilization: parseEther("0.9"),
      options: {
        timestamp: TIMESTAMP,
        defaultSupplyTargetUtilization: parseEther("0.9"),
      },
    });

    expect(available).toBe(250n * MathLib.WAD);
  });

  test("behavior: returns only own headroom when supplyTargetUtilization > targetUtilization", () => {
    // target 90% < default supplyTarget 90.5% → reallocation would not trigger.
    // ownHeadroom = 1000 * 0.9 - 850 = 50; shared liquidity excluded.
    const data = makeMockState({
      targetMarket: makeMarket({
        totalSupplyAssets: 1000n * MathLib.WAD,
        totalBorrowAssets: 850n * MathLib.WAD,
      }),
      withdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
      ],
    });

    expect(
      computeLiquidityToTargetUtilization({
        reallocationData: data,
        marketId: targetParams.id,
        targetUtilization: parseEther("0.9"),
        options: { timestamp: TIMESTAMP }, // default supplyTarget = 90.5%
      }),
    ).toBe(50n * MathLib.WAD);
  });

  test("behavior: returns only shared liquidity when target equals current utilization", () => {
    // 1000 supply, 900 borrow → current util 90% = target. ownHeadroom is 0.
    const data = makeMockState({
      targetMarket: makeMarket({
        totalSupplyAssets: 1000n * MathLib.WAD,
        totalBorrowAssets: 900n * MathLib.WAD,
      }),
      withdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
      ],
    });

    expect(
      computeLiquidityToTargetUtilization({
        reallocationData: data,
        marketId: targetParams.id,
        targetUtilization: parseEther("0.9"),
        options: {
          timestamp: TIMESTAMP,
          defaultSupplyTargetUtilization: parseEther("0.9"),
        },
      }),
    ).toBe(200n * MathLib.WAD);
  });

  test("behavior: passes discovery options through without forcing aggressive withdrawal", () => {
    let captured: PublicAllocatorOptions | undefined;
    const data = makeMockState({
      targetMarket: makeMarket({
        totalSupplyAssets: 1000n * MathLib.WAD,
        totalBorrowAssets: 850n * MathLib.WAD,
      }),
      withdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 10n * MathLib.WAD },
      ],
      onReallocations: (options) => {
        captured = options;
      },
    });

    computeLiquidityToTargetUtilization({
      reallocationData: data,
      marketId: targetParams.id,
      targetUtilization: parseEther("0.9"),
      options: {
        defaultSupplyTargetUtilization: parseEther("0.9"),
        defaultMaxWithdrawalUtilization: parseEther("0.92"),
      },
    });

    // The caller's withdrawal cap is preserved, not overridden to WAD.
    expect(captured?.defaultMaxWithdrawalUtilization).toBe(parseEther("0.92"));
    expect(captured?.maxWithdrawalUtilization).toBeUndefined();
  });

  test("behavior: returns 0n when own headroom is exhausted and no shared liquidity", () => {
    // 1000 supply, 950 borrow (95% util). target 90% < current → ownHeadroom 0.
    const data = makeMockState({
      targetMarket: makeMarket({
        totalSupplyAssets: 1000n * MathLib.WAD,
        totalBorrowAssets: 950n * MathLib.WAD,
      }),
      withdrawals: [],
    });

    expect(
      computeLiquidityToTargetUtilization({
        reallocationData: data,
        marketId: targetParams.id,
        targetUtilization: parseEther("0.9"),
        options: {
          timestamp: TIMESTAMP,
          defaultSupplyTargetUtilization: parseEther("0.9"),
        },
      }),
    ).toBe(0n);
  });
});
