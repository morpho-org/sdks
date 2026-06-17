import { Market, MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { type Address, parseEther } from "viem";
import { describe, expect, test, vi } from "vitest";
import { CbbtcUsdcBlue, WethUsdsBlue } from "../../test/fixtures/blue.js";
import { DEFAULT_SUPPLY_TARGET_UTILIZATION } from "../helpers/constant.js";
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

describe("ReallocationData.getAvailableLiquidity", () => {
  test("default: sums reallocatable withdrawals", () => {
    const data = makeData();
    stubReallocations(data, [
      { id: sourceParamsA.id, vault: VAULT_A, assets: 120n * MathLib.WAD },
      { id: sourceParamsA.id, vault: VAULT_A, assets: 80n * MathLib.WAD },
    ]);

    expect(data.getAvailableLiquidity(targetParams.id)).toBe(
      200n * MathLib.WAD,
    );
  });

  test("behavior: returns 0n when no reallocatable liquidity", () => {
    const data = makeData();
    stubReallocations(data, []);

    expect(data.getAvailableLiquidity(targetParams.id)).toBe(0n);
  });

  test("behavior: forwards options to discovery", () => {
    const data = makeData();
    const spy = stubReallocations(data, []);
    const options = { timestamp: TIMESTAMP, enabled: true };

    data.getAvailableLiquidity(targetParams.id, options);

    expect(spy).toHaveBeenCalledWith(targetParams.id, options);
  });
});

describe("ReallocationData.getAvailableLiquidityToTargetUtilization", () => {
  test("default: own headroom + available liquidity", () => {
    // 1000 supply / 500 borrow (50% util). ownHeadroom to 90% = 1000·0.9 − 500 = 400.
    // supplyTarget set to 90% (not > target) → available liquidity (200) is added → 600.
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
    ).toBe(600n * MathLib.WAD);
  });

  test("behavior: returns only own headroom when supplyTargetUtilization > utilization", () => {
    // Default supplyTarget (90.5%) > target (90%) → reallocation would not
    // trigger, so available liquidity is excluded: ownHeadroom = 400.
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
        },
      ),
    ).toBe(400n * MathLib.WAD);
  });

  test("behavior: returns only available liquidity when utilization equals current utilization", () => {
    // 1000 supply / 900 borrow → current util 90% = target. ownHeadroom is 0.
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
    ).toBe(200n * MathLib.WAD);
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

  test("behavior: utilization defaults to DEFAULT_SUPPLY_TARGET_UTILIZATION", () => {
    const targetMarket = makeMarket({
      totalSupplyAssets: 1000n * MathLib.WAD,
      totalBorrowAssets: 500n * MathLib.WAD,
    });
    const data = makeData(targetMarket);
    stubReallocations(data, [
      { id: sourceParamsA.id, vault: VAULT_A, assets: 200n * MathLib.WAD },
    ]);

    const expected =
      targetMarket.getBorrowToUtilization(DEFAULT_SUPPLY_TARGET_UTILIZATION) +
      200n * MathLib.WAD;

    expect(data.getAvailableLiquidityToTargetUtilization(targetParams.id)).toBe(
      expected,
    );
  });
});
