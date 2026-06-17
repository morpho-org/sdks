import { Market, MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { type Address, parseEther } from "viem";
import { describe, expect, test, vi } from "vitest";
import { CbbtcUsdcBlue, WethUsdsBlue } from "../../test/fixtures/blue.js";
import type {
  PublicAllocatorOptions,
  PublicReallocation,
} from "../types/index.js";
import { ReallocationData } from "./reallocationData.js";

// --- Constants ---

const VAULT_A: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TIMESTAMP = 1_700_000_000n;
const NINETY_PERCENT = (9n * MathLib.WAD) / 10n;

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

/** Real ReallocationData holding only the target market. */
function makeData(targetMarket = makeMarket()) {
  return new ReallocationData({
    chainId: 1,
    markets: { [targetMarket.id]: targetMarket },
  });
}

/**
 * Stubs `getMarketPublicReallocations` so the metric methods can be unit-tested
 * in isolation. The discovery algorithm itself is covered by
 * `reallocationData.test.ts`. The stub mimics the `enabled: false` short-circuit.
 */
function stubReallocations(
  data: ReallocationData,
  withdrawals: readonly PublicReallocation[],
) {
  return vi
    .spyOn(data, "getMarketPublicReallocations")
    .mockImplementation((_marketId, options?: PublicAllocatorOptions) => ({
      withdrawals: options?.enabled === false ? [] : withdrawals,
      data,
    }));
}

// ---------------------------------------------------------------------------

describe("ReallocationData.getPublicReallocationLiquidity", () => {
  test("default: sums reallocatable withdrawals", () => {
    const data = makeData();
    stubReallocations(data, [
      { id: sourceParamsA.id, vault: VAULT_A, assets: 120n * MathLib.WAD },
      { id: sourceParamsA.id, vault: VAULT_A, assets: 80n * MathLib.WAD },
    ]);

    expect(data.getPublicReallocationLiquidity(targetParams.id)).toBe(
      200n * MathLib.WAD,
    );
  });

  test("behavior: returns 0n when no reallocatable liquidity", () => {
    const data = makeData();
    stubReallocations(data, []);

    expect(data.getPublicReallocationLiquidity(targetParams.id)).toBe(0n);
  });

  test("behavior: forwards options to discovery", () => {
    const data = makeData();
    const spy = stubReallocations(data, []);
    const options = { timestamp: TIMESTAMP, enabled: true };

    data.getPublicReallocationLiquidity(targetParams.id, options);

    expect(spy).toHaveBeenCalledWith(targetParams.id, options);
  });
});

describe("ReallocationData.getAvailableLiquidityToTargetUtilization", () => {
  test("default: borrow headroom to target after reallocation", () => {
    // 1000 supply / 500 borrow (50%). Reallocatable = 200 → supply 1200.
    // maxBorrow = 1200·0.9 − 500 = 1080 − 500 = 580 (the 200 counted at 0.9, not 1:1).
    const data = makeData();
    stubReallocations(data, [
      { id: sourceParamsA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
    ]);

    expect(
      data.getAvailableLiquidityToTargetUtilization(
        targetParams.id,
        NINETY_PERCENT,
        {
          timestamp: TIMESTAMP,
          defaultSupplyTargetUtilization: NINETY_PERCENT,
        },
      ),
    ).toBe(580n * MathLib.WAD);
  });

  test("behavior: returns only own headroom when supplyTargetUtilization > targetUtilization", () => {
    // Default supplyTarget (90.5%) > target (90%) → reallocation excluded: 400.
    const data = makeData();
    stubReallocations(data, [
      { id: sourceParamsA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
    ]);

    expect(
      data.getAvailableLiquidityToTargetUtilization(
        targetParams.id,
        NINETY_PERCENT,
        { timestamp: TIMESTAMP },
      ),
    ).toBe(400n * MathLib.WAD);
  });

  test("behavior: returns 0n when the market is already above the target", () => {
    // 1000 / 950 (95%) is over the 90% target; 50 reallocatable cannot create room.
    // supply 1050 → 1050·0.9 − 950 = 945 − 950 → 0.
    const data = makeData(
      makeMarket({
        totalSupplyAssets: 1000n * MathLib.WAD,
        totalBorrowAssets: 950n * MathLib.WAD,
      }),
    );
    stubReallocations(data, [
      { id: sourceParamsA.id, vault: VAULT_A, assets: 50n * MathLib.WAD },
    ]);

    expect(
      data.getAvailableLiquidityToTargetUtilization(
        targetParams.id,
        NINETY_PERCENT,
        {
          timestamp: TIMESTAMP,
          defaultSupplyTargetUtilization: NINETY_PERCENT,
        },
      ),
    ).toBe(0n);
  });

  test("behavior: counts reallocated supply at the target utilization, not 1:1", () => {
    // 1000 / 900 (90% = target). Own headroom is 0; reallocatable 200 yields
    // 1200·0.9 − 900 = 1080 − 900 = 180 = 0.9·200, not 200.
    const data = makeData(
      makeMarket({
        totalSupplyAssets: 1000n * MathLib.WAD,
        totalBorrowAssets: 900n * MathLib.WAD,
      }),
    );
    stubReallocations(data, [
      { id: sourceParamsA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
    ]);

    expect(
      data.getAvailableLiquidityToTargetUtilization(
        targetParams.id,
        NINETY_PERCENT,
        {
          timestamp: TIMESTAMP,
          defaultSupplyTargetUtilization: NINETY_PERCENT,
        },
      ),
    ).toBe(180n * MathLib.WAD);
  });

  test("behavior: forwards options to discovery without forcing an aggressive drain", () => {
    const data = makeData();
    const spy = stubReallocations(data, [
      { id: sourceParamsA.id, vault: VAULT_A, assets: 10n * MathLib.WAD },
    ]);
    const options = {
      timestamp: TIMESTAMP,
      defaultSupplyTargetUtilization: NINETY_PERCENT,
      defaultMaxWithdrawalUtilization: parseEther("0.92"),
    };

    data.getAvailableLiquidityToTargetUtilization(
      targetParams.id,
      NINETY_PERCENT,
      options,
    );

    // The caller's withdrawal cap is preserved, not overridden to WAD.
    expect(spy).toHaveBeenCalledWith(targetParams.id, options);
  });

  test("behavior: target utilization defaults to DEFAULT_SUPPLY_TARGET_UTILIZATION", () => {
    // 1000 / 500, reallocatable 200, default ceiling 90.5%:
    // supply 1200 → 1200·0.905 − 500 = 1086 − 500 = 586.
    const data = makeData(
      makeMarket({
        totalSupplyAssets: 1000n * MathLib.WAD,
        totalBorrowAssets: 500n * MathLib.WAD,
      }),
    );
    stubReallocations(data, [
      { id: sourceParamsA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
    ]);

    expect(data.getAvailableLiquidityToTargetUtilization(targetParams.id)).toBe(
      586n * MathLib.WAD,
    );
  });
});
