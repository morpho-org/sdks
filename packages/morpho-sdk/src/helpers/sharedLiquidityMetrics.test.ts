import {
  Market,
  type MarketId,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcBlue, WethUsdsBlue } from "../../test/fixtures/blue.js";
import type { ReallocationData } from "../entities/reallocationData.js";
import type { PublicAllocatorOptions } from "../types/index.js";
import { DEFAULT_SUPPLY_TARGET_UTILIZATION } from "./constant.js";
import {
  computeAvailableLiquidityToTargetUtilization,
  computeAvailableSharedLiquidity,
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

type MockWithdrawals = ReadonlyArray<{
  id: MarketId;
  vault: Address;
  assets: bigint;
}>;

interface MockStateParams {
  readonly targetMarket?: Market;
  /** Withdrawals returned at the friendly (default) withdrawal-utilization cap. */
  readonly withdrawals?: MockWithdrawals;
  /**
   * Withdrawals returned when source markets are drained to 100% utilization
   * (`defaultMaxWithdrawalUtilization === MathLib.WAD`). Defaults to `withdrawals`.
   */
  readonly aggressiveWithdrawals?: MockWithdrawals;
}

/**
 * Creates a minimal mock ReallocationData.
 *
 * Only implements the methods the metric helpers call: `getMarket` and
 * `getMarketPublicReallocations`. The discovery algorithm itself is covered by
 * `reallocationData.test.ts`; here we mock its output to test the metric math.
 * The mock honors the withdrawal-utilization cap: passing
 * `defaultMaxWithdrawalUtilization: MathLib.WAD` yields `aggressiveWithdrawals`.
 */
function makeMockState({
  targetMarket = makeMarket(),
  withdrawals = [],
  aggressiveWithdrawals,
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
      if (options?.enabled === false)
        return { withdrawals: [], data: {} as ReallocationData };

      const aggressive =
        options?.defaultMaxWithdrawalUtilization === MathLib.WAD;

      return {
        withdrawals: [
          ...(aggressive
            ? (aggressiveWithdrawals ?? withdrawals)
            : withdrawals),
        ],
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

  test("behavior: maxWithdrawalUtilization at WAD reports the aggressive amount", () => {
    // Friendly (default 92% source cap) frees 200; draining sources to 100%
    // (defaultMaxWithdrawalUtilization = WAD) frees 300.
    const data = makeMockState({
      withdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
      ],
      aggressiveWithdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 300n * MathLib.WAD },
      ],
    });

    // Default: friendly 92% ceiling.
    expect(
      computeAvailableSharedLiquidity({
        reallocationData: data,
        marketId: targetParams.id,
      }),
    ).toBe(200n * MathLib.WAD);

    // Aggressive: source markets drained to 100% utilization.
    expect(
      computeAvailableSharedLiquidity({
        reallocationData: data,
        marketId: targetParams.id,
        options: { defaultMaxWithdrawalUtilization: MathLib.WAD },
      }),
    ).toBe(300n * MathLib.WAD);
  });
});

describe("computeAvailableLiquidityToTargetUtilization", () => {
  const NINETY_PERCENT = (9n * MathLib.WAD) / 10n;

  // Target at 100% utilization (supply 900/borrow 900): at/above the ceiling.
  const overTarget = makeMarket({
    totalSupplyAssets: 900n * MathLib.WAD,
    totalBorrowAssets: 900n * MathLib.WAD,
  });

  test("default", () => {
    // Default target sits at 50% (supply 1000/borrow 500): own headroom to 90%
    // is 1000·0.9 − 500 = 400, plus 300 of aggressively drained shared liquidity
    // (the friendly 120 must be ignored) → 700.
    const data = makeMockState({
      withdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 120n * MathLib.WAD },
      ],
      aggressiveWithdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 300n * MathLib.WAD },
      ],
    });

    expect(
      computeAvailableLiquidityToTargetUtilization({
        reallocationData: data,
        marketId: targetParams.id,
        targetUtilization: NINETY_PERCENT,
      }),
    ).toBe(700n * MathLib.WAD);
  });

  test("behavior: own headroom only when discovery is disabled", () => {
    // No shared liquidity, but the target's own headroom to 90% remains: 400.
    const data = makeMockState({
      aggressiveWithdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 300n * MathLib.WAD },
      ],
    });

    expect(
      computeAvailableLiquidityToTargetUtilization({
        reallocationData: data,
        marketId: targetParams.id,
        targetUtilization: NINETY_PERCENT,
        options: { enabled: false },
      }),
    ).toBe(400n * MathLib.WAD);
  });

  test("behavior: returns 0n when the target is at or above the ceiling", () => {
    // Target at 100% utilization: no borrowable liquidity, shared is ignored.
    const data = makeMockState({
      targetMarket: overTarget,
      aggressiveWithdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 300n * MathLib.WAD },
      ],
    });

    expect(
      computeAvailableLiquidityToTargetUtilization({
        reallocationData: data,
        marketId: targetParams.id,
        targetUtilization: NINETY_PERCENT,
      }),
    ).toBe(0n);
  });

  test("behavior: default ceiling is DEFAULT_SUPPLY_TARGET_UTILIZATION", () => {
    const targetMarket = makeMarket({
      totalSupplyAssets: 1000n * MathLib.WAD,
      totalBorrowAssets: 500n * MathLib.WAD,
    });
    const data = makeMockState({
      targetMarket,
      aggressiveWithdrawals: [
        { id: sourceParamsA.id, vault: VAULT_A, assets: 300n * MathLib.WAD },
      ],
    });

    const expected =
      targetMarket.getBorrowToUtilization(DEFAULT_SUPPLY_TARGET_UTILIZATION) +
      300n * MathLib.WAD;

    expect(
      computeAvailableLiquidityToTargetUtilization({
        reallocationData: data,
        marketId: targetParams.id,
      }),
    ).toBe(expected);
  });
});
