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
import { computeAvailableSharedLiquidity } from "./sharedLiquidityMetrics.js";

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
}: MockStateParams = {}): ReallocationData {
  return {
    getMarket: (id: MarketId) => {
      if (id !== targetMarket.id) throw new Error(`Mock: unknown market ${id}`);
      return targetMarket;
    },
    getMarketPublicReallocations: (
      _id: MarketId,
      options?: PublicAllocatorOptions,
    ) => ({
      withdrawals: options?.enabled === false ? [] : [...withdrawals],
      data: {} as ReallocationData,
    }),
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
