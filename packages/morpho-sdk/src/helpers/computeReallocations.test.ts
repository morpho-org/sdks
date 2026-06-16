import {
  Market,
  type MarketId,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { type Address, parseEther } from "viem";
import { describe, expect, test } from "vitest";
import {
  CbbtcUsdcBlue,
  WbtcUsdcSourceMarket,
  WethUsdsBlue,
  WstethUsdcSourceMarket,
} from "../../test/fixtures/blue.js";
import type { ReallocationData } from "../entities/reallocationData.js";
import {
  InsufficientSharedLiquidityError,
  MissingPublicAllocatorConfigError,
  ReallocationWithdrawExceedsMarketSupplyError,
} from "../types/index.js";
import { computeReallocations } from "./computeReallocations.js";

// --- Constants ---

const VAULT_A: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const VAULT_B: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TIMESTAMP = 1_700_000_000n;

// --- Market fixtures ---

const targetParams = new MarketParams(WethUsdsBlue);
const sourceParamsA = new MarketParams(CbbtcUsdcBlue);
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

const marketWithId = (market: Market, id: MarketId) => {
  const clonedMarket = new Market(market);
  Object.defineProperty(clonedMarket.params, "id", { value: id });
  return clonedMarket;
};

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
  readonly extraMarkets?: readonly Market[];
}

/**
 * Creates a minimal mock ReallocationData.
 *
 * Only implements the methods computeReallocations actually calls:
 * `getMarket`, `getMarketPublicReallocations`, and `getVault`.
 */
function makeMockState({
  targetMarket: tm = defaultTarget,
  friendlyWithdrawals = [],
  friendlyTargetMarket,
  aggressiveWithdrawals = [],
  vaultFees = {},
  extraMarkets = [],
}: MockStateParams = {}): ReallocationData {
  const markets = new Map<string, Market>();
  markets.set(tm.id, tm);
  markets.set(sourceA.id, sourceA);
  markets.set(sourceB.id, sourceB);
  markets.set(sourceC.id, sourceC);
  for (const market of extraMarkets) markets.set(market.id, market);

  const friendlyData = {
    getMarket: (id: MarketId) =>
      id === tm.id && friendlyTargetMarket != null
        ? friendlyTargetMarket
        : markets.get(id)!,
    getMarketPublicReallocations: () => ({
      withdrawals: [...aggressiveWithdrawals],
      data: {} as ReallocationData,
    }),
  };

  return {
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
  } as unknown as ReallocationData;
}

// ---------------------------------------------------------------------------
// Early returns
// ---------------------------------------------------------------------------

describe("computeReallocations", () => {
  describe("early returns", () => {
    test("should return empty when enabled is false", () => {
      const result = computeReallocations({
        reallocationData: {} as ReallocationData,
        marketId: targetParams.id,
        operation: "borrow",
        amount: MathLib.WAD,
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
        operation: "borrow",
        amount: MathLib.WAD,
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
        operation: "borrow",
        amount: borrowAmount,
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
        operation: "borrow",
        amount: borrowAmount,
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
        operation: "borrow",
        amount: borrowAmount,
        options: { enabled: true },
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.withdrawals.length).toBe(2);

      const [first, second] = result[0]!.withdrawals;
      expect(first!.marketParams.id < second!.marketParams.id).toBe(true);
    });

    test("behavior: sorts 3+ source markets strictly ascending by market id", () => {
      // Locks the byte-wise market-id comparator: PublicAllocator.reallocateTo
      // rejects a vault's withdrawals when they are not strictly ascending by
      // market id, so a locale-dependent sort can revert a valid plan.
      const borrowAmount = 500n * MathLib.WAD;

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        // Provided in scrambled order — output must be sorted by market id.
        friendlyWithdrawals: [
          { id: sourceC.id, vault: VAULT_A, assets: 50n * MathLib.WAD },
          { id: sourceA.id, vault: VAULT_A, assets: 50n * MathLib.WAD },
          { id: sourceB.id, vault: VAULT_A, assets: 50n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 0n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "borrow",
        amount: borrowAmount,
        options: {
          enabled: true,
          // Low supply target → requiredAssets covers all three withdrawals
          // so none is dropped by capping.
          defaultSupplyTargetUtilization: MathLib.WAD / 2n,
        },
      });

      expect(result).toHaveLength(1);

      const ids = result[0]!.withdrawals.map(
        ({ marketParams }) => marketParams.id,
      );
      expect(ids).toHaveLength(3);

      // Order-sensitive: output equals the byte-wise ascending order, and
      // every adjacent pair is strictly increasing.
      const sorted = [...ids].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
      expect(ids).toEqual(sorted);
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i - 1]! < ids[i]!).toBe(true);
      }
    });

    test("behavior: sorts mixed-case source market ids by normalized hex bytes", () => {
      const borrowAmount = 500n * MathLib.WAD;
      const mixedSourceA = `0x${"a".repeat(64)}` as MarketId;
      const mixedSourceB = `0x${"B".repeat(64)}` as MarketId;

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        friendlyWithdrawals: [
          { id: mixedSourceB, vault: VAULT_A, assets: 50n * MathLib.WAD },
          { id: mixedSourceA, vault: VAULT_A, assets: 50n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 0n },
        extraMarkets: [
          marketWithId(sourceA, mixedSourceA),
          marketWithId(sourceB, mixedSourceB),
        ],
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "borrow",
        amount: borrowAmount,
        options: { enabled: true },
      });

      expect(
        result[0]!.withdrawals.map(({ marketParams }) => marketParams.id),
      ).toEqual([mixedSourceA, mixedSourceB]);
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
        operation: "borrow",
        amount: borrowAmount,
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
        operation: "borrow",
        amount: borrowAmount,
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
        operation: "borrow",
        amount: borrowAmount,
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

    test("should prioritize vault groups with larger total withdrawal assets", () => {
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
          { id: sourceA.id, vault: VAULT_B, assets: 50n * MathLib.WAD },
          { id: sourceB.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 1000n, [VAULT_B]: 2000n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "borrow",
        amount: borrowAmount,
        options: { enabled: true },
      });

      expect(result[0]!.vault).toBe(VAULT_A);
    });

    test("should group by vault before capping to avoid an unnecessary second vault fee", () => {
      const tm = makeMarket(targetParams, {
        totalSupplyAssets: 800n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });
      const borrowAmount = 500n * MathLib.WAD;

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1060n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        targetMarket: tm,
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 150n * MathLib.WAD },
          { id: sourceB.id, vault: VAULT_B, assets: 60n * MathLib.WAD },
          { id: sourceC.id, vault: VAULT_A, assets: 50n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 1000n, [VAULT_B]: 2000n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "borrow",
        amount: borrowAmount,
        options: {
          enabled: true,
          supplyTargetUtilization: { [targetParams.id]: MathLib.WAD },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.vault).toBe(VAULT_A);
      expect(result[0]!.fee).toBe(1000n);
      expect(result[0]!.withdrawals).toEqual(
        expect.arrayContaining([
          { marketParams: sourceA.params, amount: 150n * MathLib.WAD },
          { marketParams: sourceC.params, amount: 50n * MathLib.WAD },
        ]),
      );
      expect(
        result[0]!.withdrawals.some(
          ({ marketParams }) => marketParams.id === sourceB.id,
        ),
      ).toBe(false);
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
        operation: "borrow",
        amount: borrowAmount,
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
        operation: "borrow",
        amount: borrowAmount,
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
        operation: "borrow",
        amount: borrowAmount,
        options: {
          enabled: true,
          supplyTargetUtilization: { [targetParams.id]: 0n },
        },
      });

      expect(result).toHaveLength(1);
      // With MAX_UINT_160 as requiredAssets, the full withdrawal amount is used (no capping).
      expect(result[0]!.withdrawals[0]!.amount).toBe(300n * MathLib.WAD);
    });

    test("should return empty when required assets is non-positive", () => {
      const result = computeReallocations({
        reallocationData: makeMockState(),
        marketId: targetParams.id,
        operation: "borrow",
        amount: 500n * MathLib.WAD,
        options: {
          enabled: true,
          defaultSupplyTargetUtilization: -MathLib.WAD,
        },
      });

      expect(result).toEqual([]);
    });

    test("should skip zero-sized withdrawals before grouping reallocations", () => {
      const borrowAmount = 500n * MathLib.WAD;
      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });
      const data = makeMockState({
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 0n },
          { id: sourceB.id, vault: VAULT_A, assets: 10n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 0n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "borrow",
        amount: borrowAmount,
        options: { enabled: true },
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.withdrawals).toEqual([
        { marketParams: sourceB.params, amount: 10n * MathLib.WAD },
      ]);
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
        operation: "borrow",
        amount: borrowAmount,
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
        operation: "borrow",
        amount: borrowAmount,
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

    test("error: InsufficientSharedLiquidityError when reallocations cannot cover the borrow shortfall", () => {
      // Shortfall 200 WAD; total available 50 + 100 = 150 WAD.
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
          { id: sourceB.id, vault: VAULT_A, assets: 100n * MathLib.WAD },
        ],
        vaultFees: { [VAULT_A]: 1000n },
      });

      try {
        computeReallocations({
          reallocationData: data,
          marketId: targetParams.id,
          operation: "borrow",
          amount: borrowAmount,
          options: { enabled: true },
        });
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(InsufficientSharedLiquidityError);
        const err = e as InsufficientSharedLiquidityError;
        expect(err.params.marketId).toBe(targetParams.id);
        expect(err.params.shortfall).toBe(200n * MathLib.WAD);
        expect(err.params.available).toBe(150n * MathLib.WAD);
      }
    });

    test("error: InsufficientSharedLiquidityError just-below-boundary case (locks strict < comparison)", () => {
      // Shortfall 200 WAD; available 50 + 149 = 199 WAD (one WAD short).
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
          { id: sourceB.id, vault: VAULT_A, assets: 149n * MathLib.WAD },
        ],
        vaultFees: { [VAULT_A]: 1000n },
      });

      try {
        computeReallocations({
          reallocationData: data,
          marketId: targetParams.id,
          operation: "borrow",
          amount: borrowAmount,
          options: { enabled: true },
        });
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(InsufficientSharedLiquidityError);
        const err = e as InsufficientSharedLiquidityError;
        expect(err.params.shortfall).toBe(200n * MathLib.WAD);
        expect(err.params.available).toBe(199n * MathLib.WAD);
      }
    });

    test("behavior: does not throw when absolute shortfall is zero even if supply target is unmet", () => {
      const borrowAmount = 500n * MathLib.WAD;

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: 1500n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      });

      const data = makeMockState({
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: 50n * MathLib.WAD },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 0n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "borrow",
        amount: borrowAmount,
        options: { enabled: true },
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.withdrawals[0]!.amount).toBe(50n * MathLib.WAD);
    });

    test("error: MissingPublicAllocatorConfigError when vault config is missing", () => {
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
          operation: "borrow",
          amount: borrowAmount,
          options: { enabled: true },
        }),
      ).toThrow(MissingPublicAllocatorConfigError);
    });
  });

  // ---------------------------------------------------------------------------
  // Operation: withdraw
  // ---------------------------------------------------------------------------

  describe("operation: withdraw", () => {
    test("should return empty when post-withdraw utilization is below supply target", () => {
      // Default market: S=1000, B=500. Withdraw 100 → S'=900, util = 500/900 ≈ 55.5% < 90.5%.
      const data = makeMockState();
      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "withdraw",
        amount: parseEther("100"),
        options: { enabled: true },
      });
      expect(result).toEqual([]);
    });

    test("should return friendly reallocations when post-withdraw utilization exceeds target", () => {
      // S=1000, B=500. Withdraw 460 → S'=540, util = 500/540 ≈ 92.6% > 90.5%.
      const withdrawAmount = parseEther("460");

      // After friendly reallocation: target gets +500 supply, easing utilization.
      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: parseEther("1500"),
        totalBorrowAssets: parseEther("500"),
      });

      const data = makeMockState({
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: parseEther("500") },
        ],
        friendlyTargetMarket,
        vaultFees: { [VAULT_A]: 0n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "withdraw",
        amount: withdrawAmount,
        options: { enabled: true },
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.vault).toBe(VAULT_A);
      expect(result[0]!.withdrawals[0]!.amount).toBeGreaterThan(0n);
    });

    test("should fall back to aggressive when friendly is insufficient", () => {
      // S=600, B=500. Withdraw 200 → S'=400, B=500 > S' so on-chain revert without help.
      const tm = makeMarket(targetParams, {
        totalSupplyAssets: parseEther("600"),
        totalBorrowAssets: parseEther("500"),
      });
      const withdrawAmount = parseEther("200");

      // Friendly: target after = +50 supply → still S=650, B=500. Withdraw 200 → S'=450 < B=500.
      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: parseEther("650"),
        totalBorrowAssets: parseEther("500"),
      });

      const data = makeMockState({
        targetMarket: tm,
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: parseEther("50") },
        ],
        friendlyTargetMarket,
        aggressiveWithdrawals: [
          { id: sourceB.id, vault: VAULT_A, assets: parseEther("200") },
        ],
        vaultFees: { [VAULT_A]: 0n },
      });

      const result = computeReallocations({
        reallocationData: data,
        marketId: targetParams.id,
        operation: "withdraw",
        amount: withdrawAmount,
        options: { enabled: true },
      });

      // absoluteShortfall = B − (S − withdrawAmount) = 500 − 400 = 100.
      // Phase 2 covers it via the aggressive withdrawals.
      expect(result).toHaveLength(1);
      const totalAmount = result[0]!.withdrawals.reduce(
        (sum, w) => sum + w.amount,
        0n,
      );
      expect(totalAmount).toBeGreaterThanOrEqual(parseEther("100"));
    });

    test("should throw InsufficientSharedLiquidityError when even aggressive falls short", () => {
      // S=600, B=500. Withdraw 200 → S'=400 < B=500. Absolute shortfall = 100.
      const tm = makeMarket(targetParams, {
        totalSupplyAssets: parseEther("600"),
        totalBorrowAssets: parseEther("500"),
      });
      const withdrawAmount = parseEther("200");

      const friendlyTargetMarket = makeMarket(targetParams, {
        totalSupplyAssets: parseEther("605"),
        totalBorrowAssets: parseEther("500"),
      });

      const data = makeMockState({
        targetMarket: tm,
        // Only 5 + 50 = 55 available < 100 shortfall.
        friendlyWithdrawals: [
          { id: sourceA.id, vault: VAULT_A, assets: parseEther("5") },
        ],
        friendlyTargetMarket,
        aggressiveWithdrawals: [
          { id: sourceB.id, vault: VAULT_A, assets: parseEther("50") },
        ],
        vaultFees: { [VAULT_A]: 0n },
      });

      expect(() =>
        computeReallocations({
          reallocationData: data,
          marketId: targetParams.id,
          operation: "withdraw",
          amount: withdrawAmount,
          options: { enabled: true },
        }),
      ).toThrow(InsufficientSharedLiquidityError);
    });

    test("error: ReallocationWithdrawExceedsMarketSupplyError when amount exceeds market supply", () => {
      // Default target: S=1000, B=500. Withdraw 1001 → would yield S' negative.
      // Without the guard, getUtilization returns a negative ratio that slips
      // under supplyTargetUtilization and silently returns [] — masking a sure revert.
      const data = makeMockState();
      const withdrawAmount = parseEther("1001");

      try {
        computeReallocations({
          reallocationData: data,
          marketId: targetParams.id,
          operation: "withdraw",
          amount: withdrawAmount,
          options: { enabled: true },
        });
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ReallocationWithdrawExceedsMarketSupplyError);
        const err = e as ReallocationWithdrawExceedsMarketSupplyError;
        expect(err.params.marketId).toBe(targetParams.id);
        expect(err.params.withdrawAmount).toBe(withdrawAmount);
        expect(err.params.totalSupplyAssets).toBe(parseEther("1000"));
      }
    });

    test("should not throw when withdraw amount equals total supply (boundary)", () => {
      // Edge: amount === totalSupplyAssets is reachable on-chain (drains supply
      // exactly, B must be 0 for the call to succeed); we delegate the
      // utilization / shortfall reasoning to the rest of the algorithm.
      const tm = makeMarket(targetParams, {
        totalSupplyAssets: parseEther("1000"),
        totalBorrowAssets: 0n,
      });
      const data = makeMockState({ targetMarket: tm });
      expect(() =>
        computeReallocations({
          reallocationData: data,
          marketId: targetParams.id,
          operation: "withdraw",
          amount: parseEther("1000"),
          options: { enabled: true },
        }),
      ).not.toThrow(ReallocationWithdrawExceedsMarketSupplyError);
    });
  });
});
