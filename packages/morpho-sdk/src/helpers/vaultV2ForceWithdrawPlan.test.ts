import {
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  MathLib,
} from "@morpho-org/blue-sdk";
import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_ADAPTER,
  IN_KIND_FOREIGN_ADAPTER,
  inKindMarketParams,
  secondInKindMarketParams,
  vaultV2ExitData,
} from "../../test/fixtures/inKindRedeem.js";
import { NonPositiveInputError } from "../types/index.js";
import {
  computeVaultV2ForceWithdrawPlan,
  computeVaultV2ForceWithdrawSharesBurnt,
  resolveVaultV2ForceWithdrawEligibility,
} from "./vaultV2ForceWithdrawPlan.js";

const TWO_PERCENT = 20_000_000_000_000_000n;

/** Resolves eligibility and plans in one step, failing the test on an ineligible fixture. */
const planFor = (params: {
  readonly vaultData: AccrualVaultV2;
  readonly exitAssets: bigint;
  readonly timestamp?: bigint;
}) => {
  const eligibility = resolveVaultV2ForceWithdrawEligibility(params.vaultData);
  if (eligibility.type !== "eligible") {
    throw new Error(`Expected an eligible fixture, got "${eligibility.type}"`);
  }

  return computeVaultV2ForceWithdrawPlan({
    vaultData: params.vaultData,
    adapter: eligibility.adapter,
    liquidityMarketId: eligibility.liquidityMarketId,
    exitAssets: params.exitAssets,
    timestamp: params.timestamp ?? 0n,
  });
};

describe("resolveVaultV2ForceWithdrawEligibility", () => {
  test("default", () => {
    const vaultData = vaultV2ExitData();

    const eligibility = resolveVaultV2ForceWithdrawEligibility(vaultData);

    expect(eligibility).toEqual({
      type: "eligible",
      adapter: vaultData.accrualAdapters[0],
      liquidityMarketId: undefined,
    });
  });

  test("behavior: resolves the liquidity market when the sole adapter routes liquidity", () => {
    const eligibility = resolveVaultV2ForceWithdrawEligibility(
      vaultV2ExitData({ liquidityAdapter: "sole" }),
    );

    expect(eligibility).toMatchObject({
      type: "eligible",
      liquidityMarketId: inKindMarketParams.id,
    });
  });

  test("behavior: rejects a vault without exactly one adapter", () => {
    expect(
      resolveVaultV2ForceWithdrawEligibility(
        vaultV2ExitData({ adapters: "empty" }),
      ),
    ).toEqual({ type: "adapterCount", adapters: 0 });
  });

  test("behavior: rejects an adapter override outside the vault", () => {
    expect(
      resolveVaultV2ForceWithdrawEligibility(
        vaultV2ExitData(),
        IN_KIND_FOREIGN_ADAPTER,
      ),
    ).toEqual({ type: "adapterMismatch", adapter: IN_KIND_FOREIGN_ADAPTER });
  });

  test("behavior: rejects a legacy positions-based adapter", () => {
    expect(
      resolveVaultV2ForceWithdrawEligibility(
        vaultV2ExitData({ adapters: "legacy" }),
      ),
    ).toEqual({ type: "unsupportedAdapter", adapter: IN_KIND_ADAPTER });
  });

  test("behavior: rejects a liquidity adapter that is not the sole adapter", () => {
    expect(
      resolveVaultV2ForceWithdrawEligibility(
        vaultV2ExitData({ liquidityAdapter: "foreign" }),
      ),
    ).toEqual({
      type: "unsupportedLiquidityAdapter",
      liquidityAdapter: IN_KIND_FOREIGN_ADAPTER,
      adapter: IN_KIND_ADAPTER,
    });
  });

  test("behavior: rejects liquidity data the contract cannot decode", () => {
    expect(
      resolveVaultV2ForceWithdrawEligibility(
        vaultV2ExitData({ liquidityAdapter: "undecodable" }),
      ),
    ).toMatchObject({
      type: "undecodableLiquidityData",
      liquidityAdapter: IN_KIND_ADAPTER,
      liquidityData: "0xdead",
      cause: expect.any(Error),
    });
  });
});

describe("computeVaultV2ForceWithdrawPlan", () => {
  test.each([0n, -1n])(
    "error: NonPositiveInputError for a non-positive exitAssets of %s",
    (exitAssets) => {
      expect(() =>
        planFor({ vaultData: vaultV2ExitData(), exitAssets }),
      ).toThrow(NonPositiveInputError);
    },
  );

  test("default", () => {
    // Market holds 1000 assets with 900 borrowed, so the adapter can only release 100.
    const plan = planFor({
      vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
      exitAssets: 51n,
    });

    expect(plan).toEqual({
      penalty: TWO_PERCENT,
      assetsToWithdraw: 0n,
      // floor(51 * 1e18 / 1.02e18) === 50
      assetsToDeallocate: 50n,
      // ceil(50 * 0.02) === 1, single leg
      penaltyAssets: 1n,
      withdrawnAssets: 50n,
      coveredAssets: 100n,
      // 0 + ceil(101 * 1.02) - 1 === 104 - 1
      maxExitAssets: 103n,
      penaltyLegs: 1,
    });
  });

  test("behavior: withdraws idle assets before charging any penalty", () => {
    const plan = planFor({
      vaultData: vaultV2ExitData({ assetBalance: 40n, penalty: TWO_PERCENT }),
      exitAssets: 40n,
    });

    expect(plan).toMatchObject({
      assetsToWithdraw: 40n,
      assetsToDeallocate: 0n,
      penaltyAssets: 0n,
      withdrawnAssets: 40n,
      penaltyLegs: 0,
    });
  });

  test("behavior: adds penalty-free liquidity-adapter capacity to idle assets", () => {
    const plan = planFor({
      vaultData: vaultV2ExitData({
        assetBalance: 40n,
        liquidityAdapter: "sole",
        penalty: TWO_PERCENT,
      }),
      exitAssets: 140n,
    });

    // Idle 40 plus the liquidity market's 100 available, all penalty-free.
    expect(plan).toMatchObject({
      assetsToWithdraw: 140n,
      assetsToDeallocate: 0n,
      penaltyAssets: 0n,
      withdrawnAssets: 140n,
    });
  });

  test("behavior: discounts what the penalty-free leg drained from the liquidity market", () => {
    const withoutLiquidityRouting = planFor({
      vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
      exitAssets: 51n,
    });
    const plan = planFor({
      vaultData: vaultV2ExitData({
        liquidityAdapter: "sole",
        penalty: TWO_PERCENT,
      }),
      exitAssets: 51n,
    });

    // Routing the same market through liquidity turns the whole exit penalty-free and leaves
    // nothing behind for the force-deallocation loop.
    expect(plan).toMatchObject({
      assetsToWithdraw: 51n,
      assetsToDeallocate: 0n,
      coveredAssets: 49n,
      penaltyLegs: 0,
    });
    expect(withoutLiquidityRouting.coveredAssets).toBe(100n);
  });

  test("behavior: clamps market capacity to available liquidity, not the adapter position", () => {
    // 1000 supplied, nothing borrowed: the adapter's whole 1000 position is withdrawable.
    const liquid = planFor({
      vaultData: vaultV2ExitData({ marketTotalBorrowAssets: 0n }),
      exitAssets: 1_000n,
    });
    // 1000 supplied, 990 borrowed: only 10 is withdrawable despite the same position.
    const illiquid = planFor({
      vaultData: vaultV2ExitData({ marketTotalBorrowAssets: 990n }),
      exitAssets: 1_000n,
    });

    expect(liquid.coveredAssets).toBe(1_000n);
    expect(illiquid.coveredAssets).toBe(10n);
  });

  test("behavior: sums capacity across markets and counts one penalty leg per market touched", () => {
    const plan = planFor({
      vaultData: vaultV2ExitData({
        additionalMarket: true,
        marketTotalBorrowAssets: 0n,
        secondMarketTotalBorrowAssets: 0n,
      }),
      exitAssets: 1_400n,
    });

    expect(plan).toMatchObject({
      coveredAssets: 1_500n,
      assetsToDeallocate: 1_400n,
      // 500 (smaller market) then 900 of the larger one.
      penaltyLegs: 2,
    });
  });

  test("behavior: counts only the markets the loop needs", () => {
    const plan = planFor({
      vaultData: vaultV2ExitData({
        additionalMarket: true,
        marketTotalBorrowAssets: 0n,
        secondMarketTotalBorrowAssets: 0n,
      }),
      exitAssets: 100n,
    });

    expect(plan).toMatchObject({ assetsToDeallocate: 100n, penaltyLegs: 1 });
  });

  test("behavior: maxExitAssets is the largest exit the loop can cover", () => {
    const vaultData = vaultV2ExitData({ penalty: TWO_PERCENT });
    const { maxExitAssets, coveredAssets } = planFor({
      vaultData,
      exitAssets: 1n,
    });

    expect(
      planFor({ vaultData, exitAssets: maxExitAssets }).assetsToDeallocate,
    ).toBeLessThanOrEqual(coveredAssets);
    expect(
      planFor({ vaultData, exitAssets: maxExitAssets + 1n }).assetsToDeallocate,
    ).toBeGreaterThan(coveredAssets);
  });

  test("behavior: maxExitAssets does not depend on the requested amount", () => {
    // With the same market routed through liquidity, a small request leaves part of it undrained.
    // Deriving the ceiling from that would overstate it, because at the ceiling the penalty-free
    // leg always drains the market completely.
    const vaultData = vaultV2ExitData({
      liquidityAdapter: "sole",
      penalty: TWO_PERCENT,
    });
    const small = planFor({ vaultData, exitAssets: 1n });
    const large = planFor({ vaultData, exitAssets: 10_000n });

    expect(small.coveredAssets).toBeGreaterThan(large.coveredAssets);
    expect(small.maxExitAssets).toBe(large.maxExitAssets);
    // 100 penalty-free, then nothing left to force deallocate.
    expect(small.maxExitAssets).toBe(101n);
    expect(
      planFor({ vaultData, exitAssets: small.maxExitAssets })
        .assetsToDeallocate,
    ).toBe(0n);
    expect(
      planFor({ vaultData, exitAssets: small.maxExitAssets + 1n })
        .assetsToDeallocate,
    ).toBeGreaterThan(0n);
  });

  test("behavior: maxExitAssets equals penalty-free capacity at a zero penalty", () => {
    const vaultData = vaultV2ExitData({ assetBalance: 7n, penalty: 0n });
    const { maxExitAssets, coveredAssets } = planFor({
      vaultData,
      exitAssets: 1n,
    });

    expect(maxExitAssets).toBe(7n + coveredAssets);
    expect(
      planFor({ vaultData, exitAssets: maxExitAssets }).assetsToDeallocate,
    ).toBe(coveredAssets);
  });

  // `maxExitAssets` is what the entity's coverage error tells a caller to reduce to, so it has to be
  // an amount the exit actually accepts. Without the zero-capacity special case the inversion rounds
  // up to `1n` at a positive penalty, and `1n` withdraws nothing — sending the caller from a
  // coverage error straight into a zero-withdrawal error.
  test("behavior: maxExitAssets is zero when the snapshot has no exitable capacity", () => {
    // No idle and a fully borrowed market: nothing is withdrawable and nothing is deallocatable.
    const vaultData = vaultV2ExitData({
      assetBalance: 0n,
      marketTotalBorrowAssets: 1_000n,
      penalty: TWO_PERCENT,
    });
    const plan = planFor({ vaultData, exitAssets: 1n });

    expect(plan.coveredAssets).toBe(0n);
    expect(plan.maxExitAssets).toBe(0n);
  });

  // The entity now rejects an `exitAssets` above uint256, and `previewVaultV2ForceWithdraw` hands
  // its capped `exitAssets` straight to `forceWithdraw()`. An un-saturated ceiling would therefore
  // advertise an amount the entity refuses.
  test("behavior: maxExitAssets saturates at uint256 rather than grossing up past it", () => {
    const vaultData = vaultV2ExitData({
      assetBalance: maxUint256,
      penalty: TWO_PERCENT,
    });
    const plan = planFor({ vaultData, exitAssets: 1n });

    expect(plan.maxExitAssets).toBe(maxUint256);
  });

  test("behavior: dust exitAssets round to no withdrawal under a penalty", () => {
    const plan = planFor({
      vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
      exitAssets: 1n,
    });

    expect(plan).toMatchObject({
      assetsToWithdraw: 0n,
      assetsToDeallocate: 0n,
      withdrawnAssets: 0n,
      penaltyLegs: 0,
    });
  });

  test("behavior: accrues market capacity to the supplied timestamp", () => {
    // Accrual raises `totalSupplyAssets` and `totalBorrowAssets` by the same interest, so market
    // liquidity is invariant and only the adapter's position grows. The position (100_000) must
    // therefore be the binding constraint, well below available liquidity (500_000).
    const vaultData = vaultV2ExitData({
      marketTotalAssets: 1_000_000n,
      marketTotalBorrowAssets: 500_000n,
      supplyShares: 100_000_000n,
      rateAtTarget: 1_000_000_000_000n,
    });
    const [adapter] = vaultData.accrualAdapters;
    if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
      throw new Error("Expected a MorphoMarketV1AdapterV2 fixture");
    }
    const lastUpdate = adapter.markets[0]?.lastUpdate ?? 0n;

    const atSnapshot = planFor({
      vaultData,
      exitAssets: 1n,
      timestamp: lastUpdate,
    });
    const accrued = planFor({
      vaultData,
      exitAssets: 1n,
      timestamp: lastUpdate + 86_400n,
    });

    expect(accrued.coveredAssets).toBeGreaterThan(atSnapshot.coveredAssets);
  });

  test("behavior: treats a liquidity market absent from the snapshot as zero capacity", () => {
    const plan = planFor({
      vaultData: vaultV2ExitData({
        liquidityAdapter: "sole",
        liquidityMarket: "second",
        penalty: TWO_PERCENT,
      }),
      exitAssets: 51n,
    });

    // The second market is not in the single-market adapter snapshot.
    expect(secondInKindMarketParams.id).not.toBe(inKindMarketParams.id);
    expect(plan).toMatchObject({
      assetsToWithdraw: 0n,
      assetsToDeallocate: 50n,
    });
  });
});

describe("computeVaultV2ForceWithdrawSharesBurnt", () => {
  test("default", () => {
    const vaultData = vaultV2ExitData({ penalty: TWO_PERCENT });
    const plan = planFor({ vaultData, exitAssets: 51n });
    const { vault: deadlineVaultData } = vaultData.accrueInterest(
      vaultData.lastUpdate,
    );

    // Share price is 1 in the fixture: 50 deallocated plus 1 penalty asset. Two legs move a
    // positive amount (the penalty burn and the deallocated leg), and converting the aggregate
    // already spent one ceiling, so exactly one extra share of slack is owed.
    expect(plan).toMatchObject({ assetsToWithdraw: 0n, penaltyLegs: 1 });
    expect(
      computeVaultV2ForceWithdrawSharesBurnt({
        vaultData,
        deadlineVaultData,
        plan,
      }),
    ).toBe(51n + 1n);
  });

  // The bound is the slippage denominator, so slack for a leg that moves nothing widens the price
  // drop the exit accepts. Worst on a dust exit, where phantom shares dominate the real burn.
  test("behavior: adds no slack when only one leg moves a positive amount", () => {
    // Idle covers the whole exit: no deallocation, no penalty burn, one positive withdrawal.
    const vaultData = vaultV2ExitData({
      assetBalance: 1_000n,
      penalty: TWO_PERCENT,
    });
    const plan = planFor({ vaultData, exitAssets: 100n });
    const { vault: deadlineVaultData } = vaultData.accrueInterest(
      vaultData.lastUpdate,
    );

    expect(plan).toMatchObject({ assetsToDeallocate: 0n, penaltyLegs: 0 });
    expect(
      computeVaultV2ForceWithdrawSharesBurnt({
        vaultData,
        deadlineVaultData,
        plan,
      }),
    ).toBe(vaultData.toShares(plan.withdrawnAssets, "Up"));
  });

  test("behavior: a zero penalty owes no per-forceDeallocate slack", () => {
    const vaultData = vaultV2ExitData({
      additionalMarket: true,
      marketTotalBorrowAssets: 0n,
      secondMarketTotalBorrowAssets: 0n,
      penalty: 0n,
    });
    const plan = planFor({ vaultData, exitAssets: 1_400n });
    const { vault: deadlineVaultData } = vaultData.accrueInterest(
      vaultData.lastUpdate,
    );

    // `forceDeallocate` burns nothing at a zero penalty, so those legs round nothing either, and
    // with no idle the deallocated leg is the only positive withdrawal.
    expect(plan.penaltyLegs).toBeGreaterThan(0);
    expect(plan.penaltyAssets).toBe(0n);
    expect(plan.assetsToWithdraw).toBe(0n);
    expect(
      computeVaultV2ForceWithdrawSharesBurnt({
        vaultData,
        deadlineVaultData,
        plan,
      }),
    ).toBe(vaultData.toShares(plan.withdrawnAssets, "Up"));
  });

  test("behavior: bounds every separately rounded withdrawal leg", () => {
    const vaultData = vaultV2ExitData({
      additionalMarket: true,
      marketTotalBorrowAssets: 0n,
      secondMarketTotalBorrowAssets: 0n,
      penalty: TWO_PERCENT,
    });
    const plan = planFor({ vaultData, exitAssets: 1_400n });
    const { vault: deadlineVaultData } = vaultData.accrueInterest(
      vaultData.lastUpdate,
    );

    const sharesBurnt = computeVaultV2ForceWithdrawSharesBurnt({
      vaultData,
      deadlineVaultData,
      plan,
    });

    expect(plan.penaltyLegs).toBe(2);
    // Positive legs here are the two penalty burns and the deallocated leg; the penalty-free leg
    // moves nothing. The aggregate conversion spends one ceiling, so two extra shares are owed —
    // strictly fewer than the `penaltyLegs + 2` a per-call count would charge.
    expect(plan.assetsToWithdraw).toBe(0n);
    const base = vaultData.toShares(
      plan.withdrawnAssets + plan.penaltyAssets,
      "Up",
    );
    expect(sharesBurnt).toBe(base + 2n);
    expect(sharesBurnt).toBeLessThan(base + BigInt(plan.penaltyLegs + 2));
  });

  test("behavior: takes the worse of the snapshot and deadline previews", () => {
    // A management fee mints shares over time, so the deadline preview burns more shares. The rate
    // is per-second and WAD-scaled, so it must stay small enough to keep total assets positive.
    const vaultData = vaultV2ExitData({
      penalty: TWO_PERCENT,
      managementFee: 1_000_000_000_000n,
    });
    const plan = planFor({ vaultData, exitAssets: 51n });
    const { vault: deadlineVaultData } = vaultData.accrueInterest(
      vaultData.lastUpdate + 86_400n,
    );

    const grossDebited = plan.withdrawnAssets + plan.penaltyAssets;
    expect(deadlineVaultData.toShares(grossDebited, "Up")).toBeGreaterThan(
      vaultData.toShares(grossDebited, "Up"),
    );
    expect(
      computeVaultV2ForceWithdrawSharesBurnt({
        vaultData,
        deadlineVaultData,
        plan,
      }),
    ).toBe(deadlineVaultData.toShares(grossDebited, "Up") + 1n);
  });

  test("behavior: exceeds the shares the pure asset legs alone would burn", () => {
    const vaultData = vaultV2ExitData({ penalty: TWO_PERCENT });
    const plan = planFor({ vaultData, exitAssets: 51n });
    const { vault: deadlineVaultData } = vaultData.accrueInterest(
      vaultData.lastUpdate,
    );

    // The penalty legs are the easy thing to forget; the bound must cover them.
    expect(
      computeVaultV2ForceWithdrawSharesBurnt({
        vaultData,
        deadlineVaultData,
        plan,
      }),
    ).toBeGreaterThan(vaultData.toShares(plan.withdrawnAssets, "Up"));
  });
});

describe("vault V2 force-withdraw invariants", () => {
  test("behavior: the user never receives more than exitAssets", () => {
    const vaultData = vaultV2ExitData({
      assetBalance: 13n,
      penalty: TWO_PERCENT,
    });

    for (let exitAssets = 1n; exitAssets <= 110n; exitAssets++) {
      const plan = planFor({ vaultData, exitAssets });
      expect(plan.withdrawnAssets).toBeLessThanOrEqual(exitAssets);
    }
  });

  test.each([
    ["no liquidity adapter", { penalty: TWO_PERCENT }],
    ["idle assets", { assetBalance: 13n, penalty: TWO_PERCENT }],
    ["a liquidity adapter", { liquidityAdapter: "sole", penalty: TWO_PERCENT }],
    [
      "idle assets and a liquidity adapter",
      { assetBalance: 13n, liquidityAdapter: "sole", penalty: TWO_PERCENT },
    ],
    ["a zero penalty", { assetBalance: 13n, penalty: 0n }],
  ] as const)(
    "behavior: coverage succeeds exactly up to maxExitAssets with %s",
    (_label, overrides) => {
      const vaultData = vaultV2ExitData(overrides);
      const { maxExitAssets } = planFor({ vaultData, exitAssets: 1n });

      // The entity guards on `coveredAssets >= assetsToDeallocate` and reports `maxExitAssets`.
      // The two must agree, or the reported ceiling would itself be rejected — or worse, an
      // accepted exit would overrun the contract's unbounded loop.
      for (let exitAssets = 1n; exitAssets <= maxExitAssets; exitAssets++) {
        const plan = planFor({ vaultData, exitAssets });
        expect(plan.coveredAssets).toBeGreaterThanOrEqual(
          plan.assetsToDeallocate,
        );
      }
      const beyond = planFor({ vaultData, exitAssets: maxExitAssets + 1n });
      expect(beyond.coveredAssets).toBeLessThan(beyond.assetsToDeallocate);
    },
  );

  test("behavior: the penalty bound covers every per-market ceil rounding", () => {
    const vaultData = vaultV2ExitData({
      additionalMarket: true,
      marketTotalBorrowAssets: 0n,
      secondMarketTotalBorrowAssets: 0n,
      penalty: TWO_PERCENT,
    });
    const plan = planFor({ vaultData, exitAssets: 1_400n });

    // Worst case on-chain: one ceil per leg over an arbitrary split of assetsToDeallocate.
    const worstCase =
      MathLib.wMulUp(plan.assetsToDeallocate - 1n, TWO_PERCENT) +
      MathLib.wMulUp(1n, TWO_PERCENT);
    expect(plan.penaltyAssets).toBeGreaterThanOrEqual(worstCase);
  });

  test("error: an ineligible vault yields no plan input", () => {
    expect(
      resolveVaultV2ForceWithdrawEligibility(
        vaultV2ExitData({ adapters: "legacy" }),
      ).type,
    ).not.toBe("eligible");
    expect(vaultV2ExitData().liquidityAdapter).toBe(ZERO_ADDRESS);
  });
});
