import {
  Market,
  type MarketId,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import type { SimulationState } from "@morpho-org/simulation-sdk";
import type { Address } from "viem";
import { describe, expect, test } from "vitest";
import {
  CbbtcUsdcMarketV1,
  WbtcUsdcSourceMarket,
  WethUsdsMarketV1,
  WstethUsdcSourceMarket,
} from "../../test/fixtures/marketV1.js";
import { MissingPublicAllocatorConfigError } from "../types/index.js";
import { computeReallocations } from "./computeReallocations.js";

// --- Constants ---

const VAULT_A: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const VAULT_B: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TIMESTAMP = 1_700_000_000n;

// --- Market fixtures ---

const targetParams = new MarketParams(WethUsdsMarketV1);
const sourceParamsA = new MarketParams(CbbtcUsdcMarketV1);
const sourceParamsB = new MarketParams(WbtcUsdcSourceMarket);
const sourceParamsC = new MarketParams(WstethUsdcSourceMarket);

/** Builds a Market with configurable supply/borrow. Uses TIMESTAMP as lastUpdate. */
function makeMarket(
  params: MarketParams,
  overrides?: { totalSupplyAssets?: bigint; totalBorrowAssets?: bigint },
) {
  return new Market({
    params,
    totalSupplyAssets: overrides?.totalSupplyAssets ?? 1000n * MathLib.WAD,
    totalBorrowAssets: overrides?.totalBorrowAssets ?? 500n * MathLib.WAD,
    totalSupplyShares: 1000n * MathLib.WAD,
    totalBorrowShares: 500n * MathLib.WAD,
    lastUpdate: TIMESTAMP,
    fee: 0n,
    price: 10n ** 36n,
  });
}

/** Default target market: 1000 WAD supply, 500 WAD borrow (50% utilization). */
const defaultTarget = makeMarket(targetParams);
const sourceA = makeMarket(sourceParamsA);
const sourceB = makeMarket(sourceParamsB);
const sourceC = makeMarket(sourceParamsC);

// --- Mock builder ---

interface MockStateParams {
  readonly targetMarket?: Market;
  readonly friendlyWithdrawals?: ReadonlyArray<{
    id: MarketId;
    vault: Address;
    assets: bigint;
  }>;
  /** Target market state after friendly reallocations. Controls phase 2 trigger. */
  readonly friendlyTargetMarket?: Market;
  readonly aggressiveWithdrawals?: ReadonlyArray<{
    id: MarketId;
    vault: Address;
    assets: bigint;
  }>;
  /** Map vault address → reallocation fee. Omitted vaults have no publicAllocatorConfig. */
  readonly vaultFees?: Record<string, bigint>;
}

/**
 * Creates a minimal mock SimulationState.
 *
 * Only implements the methods computeReallocations actually calls:
 * `getMarket`, `getMarketPublicReallocations`, `getVault`, `block`.
 */
function makeMockState({
  targetMarket: tm = defaultTarget,
  friendlyWithdrawals = [],
  friendlyTargetMarket,
  aggressiveWithdrawals = [],
  vaultFees = {},
}: MockStateParams = {}): SimulationState {
  const markets = new Map<string, Market>();
  markets.set(tm.id, tm);
  markets.set(sourceA.id, sourceA);
  markets.set(sourceB.id, sourceB);
  markets.set(sourceC.id, sourceC);

  const friendlyData = {
    getMarket: (id: MarketId) =>
      id === tm.id && friendlyTargetMarket != null
        ? friendlyTargetMarket
        : markets.get(id)!,
    getMarketPublicReallocations: () => ({
      withdrawals: [...aggressiveWithdrawals],
      data: {} as SimulationState,
    }),
  };

  return {
    block: { number: 0n, timestamp: TIMESTAMP },
    getMarket: (id: MarketId) => {
      const m = markets.get(id);
      if (m == null) throw new Error(`Mock: unknown market ${id}`);
      return m;
    },
    getMarketPublicReallocations: () => ({
      withdrawals: [...friendlyWithdrawals],
      data: friendlyData,
    }),
    getVault: (vault: Address) => ({
      publicAllocatorConfig: Object.hasOwn(vaultFees, vault)
        ? { admin: vault, fee: vaultFees[vault]!, accruedFee: 0n }
        : undefined,
    }),
  } as unknown as SimulationState;
}

// ---------------------------------------------------------------------------
// Early returns
// ---------------------------------------------------------------------------

describe("computeReallocations", () => {
  describe("early returns", () => {
    test("should return empty when enabled is false", () => {
      const result = computeReallocations({
        reallocationData: {} as SimulationState,
        marketId: targetParams.id,
        borrowAmount: MathLib.WAD,
        options: { enabled: false },
      });
      expect(result).toEqual([]);
    });

    test("should return empty when post-borrow utilization is below supply target", () => {
      const data = makeMockState();
      // Borrow 1 WAD: utilization ≈ 501/1000 = 50.1% < 90.5%
      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount: MathLib.WAD,
        options: { enabled: true },
      });
      expect(result).toEqual([]);
    });

    test("should proceed with reallocation when options is undefined", () => {
      // Regression: previously `!options?.enabled` short-circuited when options
      // was undefined, blocking reallocation entirely. The fix uses
      // `options?.enabled === false`, so undefined now means "enabled".
      const borrowAmount = 500n * MathLib.WAD; // → 100% utilization, above 90.5% default target

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 300n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 1000n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount,
        // No options at all — must NOT early-return.
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.vault).toBe(VAULT_A);
      expect(result[0]!.withdrawals[0]!.amount).toBeGreaterThan(0n);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 1: friendly reallocations
  // ---------------------------------------------------------------------------

  describe("phase 1: friendly reallocations", () => {
    test("should return capped friendly reallocations when sufficient", () => {
      const borrowAmount = 500n * MathLib.WAD; // → 100% utilization, above 90.5% target

      // After friendly reallocation, enough supply for the borrow.
      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 300n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 1000n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount,
        options: { enabled: true },
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.vault).toBe(VAULT_A);
      expect(result[0]!.fee).toBe(1000n);
      expect(result[0]!.withdrawals).toHaveLength(1);
      expect(result[0]!.withdrawals[0]!.marketParams).toBe(sourceA.params);
      // requiredAssets ≈ 105 WAD, so amount is capped below the offered 300 WAD.
      expect(result[0]!.withdrawals[0]!.amount).toBeGreaterThan(0n);
      expect(result[0]!.withdrawals[0]!.amount).toBeLessThan(
        300n * MathLib.WAD,
      );
    });

    test("should sort output withdrawals by ascending market id within a vault", () => {
      const borrowAmount = 500n * MathLib.WAD;

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        // Provide in arbitrary order — output must be sorted.
        friendlyWithdrawals: [
          { id: sourceB.id, vault: VAULT_A, assets: 50n * MathLib.WAD },
          { id: sourceA.id, vault: VAULT_A, assets: 50n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 0n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount,
        options: { enabled: true },
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.withdrawals.length).toBe(2);

      const [first, second] = result[0]!.withdrawals;
      expect(first!.marketParams.id < second!.marketParams.id).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 2: aggressive fallback
  // ---------------------------------------------------------------------------

  describe("phase 2: aggressive fallback", () => {
    test("should fall back to aggressive when friendly is insufficient", () => {
      // Use a market where borrow exceeds supply even after friendly reallocation.
      const tm = makeMarket(targetParams, {
        totalSupplyAssets: 800n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });
      const borrowAmount = 500n * MathLib.WAD; // newBorrow = 1000 WAD > supply 800 WAD

      // friendlyMarket: still not enough (1000 > 850 → phase 2)
      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 850n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        targetMarket: tm,
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 50n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        aggressiveWithdrawals: [
          { id: sourceB.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
        ],
        vaultFees: { [VAULT_A]: 500n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount,
        options: { enabled: true },
      });

      // Phase 2 requiredAssets = 1000 - 800 = 200 WAD.
      expect(result).toHaveLength(1);
      expect(result[0]!.vault).toBe(VAULT_A);
      expect(result[0]!.fee).toBe(500n);
      // Both friendly (50) and aggressive (150 capped) withdrawals.
      expect(result[0]!.withdrawals).toHaveLength(2);

      const totalAmount = result[0]!.withdrawals.reduce(
        (sum, w) => sum + w.amount,
        0n,
      );
      expect(totalAmount).toBe(200n * MathLib.WAD);
    });

    test("should reset requiredAssets to absolute shortfall in phase 2", () => {
      const tm = makeMarket(targetParams, {
        totalSupplyAssets: 800n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });
      const borrowAmount = 500n * MathLib.WAD;

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 850n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        targetMarket: tm,
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 50n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        aggressiveWithdrawals: [
          { id: sourceB.id, vault: VAULT_A, assets: 500n * MathLib.WAD },
        ],
        vaultFees: { [VAULT_A]: 0n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount,
        options: { enabled: true },
      });

      // requiredAssets in phase 2 = 1000 - 800 = 200 WAD (absolute shortfall),
      // NOT the utilization-target-based ~305 WAD from phase 1.
      const totalAmount = result[0]!.withdrawals.reduce(
        (sum, w) => sum + w.amount,
        0n,
      );
      expect(totalAmount).toBe(200n * MathLib.WAD);
    });
  });

  // ---------------------------------------------------------------------------
  // Grouping, deduplication, and capping
  // ---------------------------------------------------------------------------

  describe("grouping and capping", () => {
    test("should distribute withdrawals across multiple vaults", () => {
      const tm = makeMarket(targetParams, {
        totalSupplyAssets: 800n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });
      const borrowAmount = 500n * MathLib.WAD;

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        targetMarket: tm,
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
          { id: sourceB.id, vault: VAULT_B, assets: 200n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 1000n, [VAULT_B]: 2000n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount,
        options: { enabled: true },
      });

      expect(result).toHaveLength(2);

      const vaultAResult = result.find((r) => r.vault === VAULT_A);
      const vaultBResult = result.find((r) => r.vault === VAULT_B);

      expect(vaultAResult).toBeDefined();
      expect(vaultBResult).toBeDefined();
      expect(vaultAResult!.fee).toBe(1000n);
      expect(vaultBResult!.fee).toBe(2000n);
    });

    test("should deduplicate same-market withdrawals within a vault", () => {
      const tm = makeMarket(targetParams, {
        totalSupplyAssets: 800n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });
      const borrowAmount = 500n * MathLib.WAD;

      // Phase 2 triggers (1000 > 850).
      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 850n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        targetMarket: tm,
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 30n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        aggressiveWithdrawals: [
          // Same market + same vault → should be merged.
          { id: sourceA.id, vault: VAULT_A, assets: 170n * MathLib.WAD },
        ],
        vaultFees: { [VAULT_A]: 0n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount,
        options: { enabled: true },
      });

      expect(result).toHaveLength(1);
      // Merged into a single withdrawal entry (not two separate).
      expect(result[0]!.withdrawals).toHaveLength(1);
      expect(result[0]!.withdrawals[0]!.marketParams.id).toBe(sourceA.id);
      // 30 + 170 = 200, but capped at requiredAssets = 200 WAD.
      expect(result[0]!.withdrawals[0]!.amount).toBe(200n * MathLib.WAD);
    });

    test("should cap second withdrawal mid-iteration when requiredAssets is exhausted", () => {
      const borrowAmount = 500n * MathLib.WAD;

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 80n * MathLib.WAD },
          { id: sourceB.id, vault: VAULT_A, assets: 80n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 0n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount,
        options: { enabled: true },
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.withdrawals).toHaveLength(2);

      // requiredAssets ≈ 105 WAD. First gets full 80 WAD, second gets remainder (~25 WAD).
      const amounts = result[0]!.withdrawals.map((w) => w.amount);
      expect(amounts.some((a) => a === 80n * MathLib.WAD)).toBe(true);
      expect(amounts.some((a) => a < 80n * MathLib.WAD && a > 0n)).toBe(true);

      const totalAmount = amounts.reduce((sum, a) => sum + a, 0n);
      // First withdrawal uncapped (80) + second capped (remainder) = requiredAssets.
      expect(totalAmount).toBeLessThan(160n * MathLib.WAD);
      expect(totalAmount).toBeGreaterThan(80n * MathLib.WAD);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe("edge cases", () => {
    test("should use MAX_UINT_160 as requiredAssets when supplyTargetUtilization is 0", () => {
      const borrowAmount = 500n * MathLib.WAD;

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 300n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 0n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount,
        options: {
          enabled: true,
          supplyTargetUtilization: { [targetParams.id]: 0n },
        },
      });

      expect(result).toHaveLength(1);
      // With MAX_UINT_160 as requiredAssets, the full withdrawal amount is used (no capping).
      expect(result[0]!.withdrawals[0]!.amount).toBe(300n * MathLib.WAD);
    });

    test("should respect per-market supplyTargetUtilization override", () => {
      const borrowAmount = 500n * MathLib.WAD;

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 500n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 0n },
      });

      // Set target utilization very high (99%) — requires less reallocation.
      const highTarget = (99n * MathLib.WAD) / 100n;
      const resultHigh = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount,
        options: {
          enabled: true,
          supplyTargetUtilization: { [targetParams.id]: highTarget },
        },
      });

      // Set target utilization low (50%) — requires more reallocation.
      const lowTarget = MathLib.WAD / 2n;
      const resultLow = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        borrowAmount,
        options: {
          enabled: true,
          supplyTargetUtilization: { [targetParams.id]: lowTarget },
        },
      });

      // Lower target → more required assets → larger withdrawal amount.
      expect(resultLow[0]!.withdrawals[0]!.amount).toBeGreaterThan(
        resultHigh[0]!.withdrawals[0]!.amount,
      );
    });

    test("should throw MissingPublicAllocatorConfigError when vault config is missing", () => {
      const borrowAmount = 500n * MathLib.WAD;

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        // VAULT_A has no fee configured → publicAllocatorConfig is undefined.
        vaultFees: {},
      });

      expect(() =>
        computeReallocations({
          reallocationData: data,
          marketId: targetParams.id,
          borrowAmount,
          options: { enabled: true },
        }),
      ).toThrow(MissingPublicAllocatorConfigError);
    });
  });
});
