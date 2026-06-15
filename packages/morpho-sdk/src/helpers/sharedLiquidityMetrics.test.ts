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
  computeMaxBorrowToUtilization,
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

describe("computeMaxBorrowToUtilization", () => {
  test("default: max borrow to 90% with shared liquidity", () => {
    // Target market: 1000 supply, 850 borrow (85% utilization).
    // Shared liquidity (friendly + aggressive) = 200 → supply after = 1200.
    // maxBorrow = 1200 * 0.9 - 850 = 1080 - 850 = 230.
    const data = makeMockState({
      targetMarket: makeMarket({
        totalSupplyAssets: 1000n * MathLib.WAD,
        totalBorrowAssets: 850n * MathLib.WAD,
      }),
      withdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
      ],
    });

    const maxBorrow = computeMaxBorrowToUtilization({
      reallocationData: data,
      marketId: targetParams.id,
      targetUtilization: parseEther("0.9"),
      options: { timestamp: TIMESTAMP },
    });

    expect(maxBorrow).toBe(230n * MathLib.WAD);
  });

  test("behavior: drains source markets to 100% (aggressive) for the metric", () => {
    let captured: PublicAllocatorOptions | undefined;
    const data = makeMockState({
      withdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 10n * MathLib.WAD },
      ],
      onReallocations: (options) => {
        captured = options;
      },
    });

    computeMaxBorrowToUtilization({
      reallocationData: data,
      marketId: targetParams.id,
      targetUtilization: parseEther("0.9"),
      // Caller passes a friendly cap; the metric must override it with WAD.
      options: { defaultMaxWithdrawalUtilization: parseEther("0.92") },
    });

    expect(captured?.defaultMaxWithdrawalUtilization).toBe(MathLib.WAD);
    expect(captured?.maxWithdrawalUtilization).toEqual({});
  });

  test("behavior: returns 0n when already above target even with shared liquidity", () => {
    // 1000 supply, 1000 borrow (100% util). With 50 shared liquidity → 1050.
    // 1050 * 0.9 = 945 < 1000 → zeroFloorSub clamps to 0.
    const data = makeMockState({
      targetMarket: makeMarket({
        totalSupplyAssets: 1000n * MathLib.WAD,
        totalBorrowAssets: 1000n * MathLib.WAD,
      }),
      withdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 50n * MathLib.WAD },
      ],
    });

    expect(
      computeMaxBorrowToUtilization({
        reallocationData: data,
        marketId: targetParams.id,
        targetUtilization: parseEther("0.9"),
        options: { timestamp: TIMESTAMP },
      }),
    ).toBe(0n);
  });

  test("behavior: falls back to market liquidity when no shared liquidity", () => {
    // 1000 supply, 500 borrow, no shared liquidity, target 90%.
    // maxBorrow = 1000 * 0.9 - 500 = 400.
    const data = makeMockState({
      targetMarket: makeMarket({
        totalSupplyAssets: 1000n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      }),
      withdrawals: [],
    });

    expect(
      computeMaxBorrowToUtilization({
        reallocationData: data,
        marketId: targetParams.id,
        targetUtilization: parseEther("0.9"),
        options: { timestamp: TIMESTAMP },
      }),
    ).toBe(400n * MathLib.WAD);
  });
});
