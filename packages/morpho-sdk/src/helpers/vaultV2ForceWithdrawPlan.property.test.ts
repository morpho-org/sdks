import { fc, test } from "@fast-check/vitest";
import { MathLib } from "@morpho-org/blue-sdk";
import { describe, expect } from "vitest";
import { inKindVaultV2Data } from "../../test/fixtures/inKindRedeem.js";
import { MAX_SLIPPAGE_TOLERANCE } from "./constant.js";
import { computeMinForceWithdrawSharePrice } from "./slippage.js";
import {
  computeVaultV2ForceWithdrawMinSharesBurnt,
  computeVaultV2ForceWithdrawPlan,
  computeVaultV2ForceWithdrawSharesBurnt,
  resolveVaultV2ForceWithdrawEligibility,
} from "./vaultV2ForceWithdrawPlan.js";

const { WAD, mulDivDown, mulDivUp, min } = MathLib;
const RAY = 10n ** 27n;
const MAX = 10n ** 30n;
// morpho-blue SharesMathLib: VIRTUAL_SHARES = 1e6, VIRTUAL_ASSETS = 1.
const toAssetsDown = (
  shares: bigint,
  market: { assets: bigint; shares: bigint },
) => mulDivDown(shares, market.assets + 1n, market.shares + 10n ** 6n);
const toSharesUp = (
  assets: bigint,
  market: { assets: bigint; shares: bigint },
) => mulDivUp(assets, market.shares + 10n ** 6n, market.assets + 1n);

interface MarketState {
  assets: bigint;
  shares: bigint;
  borrow: bigint;
  adapterShares: bigint;
}
const available = (m: MarketState) =>
  min(toAssetsDown(m.adapterShares, m), m.assets - m.borrow);
// Morpho.withdraw(assets, 0): burns toSharesUp(assets) from the adapter.
const withdrawFrom = (m: MarketState, assets: bigint) => {
  const burnt = toSharesUp(assets, m);
  m.assets -= assets;
  m.shares -= burnt;
  m.adapterShares -= burnt;
  m.borrow = min(m.borrow, m.assets);
};

const amount = (max: bigint) =>
  fc.oneof(fc.constantFrom(0n, 1n, max), fc.bigInt({ min: 0n, max }));
const scenario = fc.record({
  marketTotalAssets: fc.oneof(fc.constantFrom(1n, 1_000n), amount(MAX)),
  borrowBps: fc.oneof(fc.constantFrom(0n, 9_000n, 10_000n), amount(10_000n)),
  adapterBps: fc.oneof(fc.constantFrom(10_000n), amount(10_000n)),
  assetBalance: amount(MAX),
  // vault-v2 ConstantsLib.sol MAX_FORCE_DEALLOCATE_PENALTY = 0.02e18.
  penalty: fc.oneof(fc.constantFrom(0n, WAD / 50n), amount(WAD / 50n)),
  supplyRatioBps: fc.bigInt({ min: 1n, max: 100_000n }),
  liquidityAdapter: fc.constantFrom("none", "sole") as fc.Arbitrary<
    "none" | "sole"
  >,
  additionalMarket: fc.boolean(),
  liquidityMarket: fc.constantFrom("first", "second") as fc.Arbitrary<
    "first" | "second"
  >,
  exitRaw: fc.bigInt({ min: 1n, max: 2n * MAX }),
  tolerance: fc.bigInt({ min: 0n, max: MAX_SLIPPAGE_TOLERANCE }),
  // vault-v2 VaultV2.sol constructor: virtualShares = 10 ** max(0, 18 - asset decimals).
  virtualShares: fc.constantFrom(1n, 10n ** 6n, 10n ** 12n, 10n ** 18n),
});

// bundles VaultExitBundlesV1.sol vaultExitBundlesV1ForceWithdrawVaultV2, replayed step by step:
// assetsToWithdraw = min(exit, idle + min(liquidityAdapterAssets, liquidity)); assetsToDeallocate =
// (exit - assetsToWithdraw).mulDivDown(WAD, WAD + penalty); loop the prefetched markets taking
// min(available, remaining) and forceDeallocate (penalty assets.mulDivUp(penalty, WAD), VaultV2.sol);
// every VaultV2.withdraw burns assets.mulDivUp(totalSupply + virtualShares, totalAssets + 1).
describe("computeVaultV2ForceWithdrawPlan", () => {
  test.prop([scenario], { numRuns: 1_000 })(
    "behavior: matches the contract's split, coverage, penalty and share burn",
    (s) => {
      const marketTotalShares = s.marketTotalAssets * 10n ** 6n;
      const first: MarketState = {
        assets: s.marketTotalAssets,
        shares: marketTotalShares,
        borrow: (s.marketTotalAssets * s.borrowBps) / 10_000n,
        adapterShares: (marketTotalShares * s.adapterBps) / 10_000n,
      };
      // Fixture defaults for the second market: 500 supplied, 450 borrowed, all held by the adapter.
      const second: MarketState = {
        assets: 500n,
        shares: 500_000_000n,
        borrow: 450n,
        adapterShares: 500_000_000n,
      };
      const markets = s.additionalMarket ? [first, second] : [first];
      const adapterAssets = markets.reduce(
        (sum, m) => sum + toAssetsDown(m.adapterShares, m),
        0n,
      );
      const totalAssets = s.assetBalance + adapterAssets;
      fc.pre(totalAssets > 0n);
      const totalSupply = (totalAssets * s.supplyRatioBps) / 10_000n + 1n;
      const liquidityMarket =
        s.additionalMarket && s.liquidityMarket === "second" ? second : first;
      const vaultData = inKindVaultV2Data({
        supplyShares: first.adapterShares,
        penalty: s.penalty,
        assetBalance: s.assetBalance,
        totalAssets,
        totalSupply,
        virtualShares: s.virtualShares,
        marketTotalAssets: first.assets,
        marketTotalBorrowAssets: first.borrow,
        marketTotalSupplyShares: first.shares,
        additionalMarket: s.additionalMarket,
        liquidityAdapter: s.liquidityAdapter,
        liquidityMarket: s.additionalMarket ? s.liquidityMarket : "first",
      });
      const eligibility = resolveVaultV2ForceWithdrawEligibility(vaultData);
      if (eligibility.type !== "eligible") throw new Error(eligibility.type);
      const exitAssets = 1n + ((s.exitRaw - 1n) % (totalAssets + 1n));
      const plan = computeVaultV2ForceWithdrawPlan({
        vaultData,
        adapter: eligibility.adapter,
        liquidityMarketId: eligibility.liquidityMarketId,
        exitAssets,
        timestamp: 0n,
      });

      const withdrawable =
        s.assetBalance +
        (s.liquidityAdapter === "sole" ? available(liquidityMarket) : 0n);
      const assetsToWithdraw = min(exitAssets, withdrawable);
      const assetsToDeallocate = mulDivDown(
        exitAssets - assetsToWithdraw,
        WAD,
        WAD + s.penalty,
      );
      expect(plan.assetsToWithdraw).toBe(assetsToWithdraw);
      expect(plan.assetsToDeallocate).toBe(assetsToDeallocate);
      expect(plan.withdrawnAssets).toBe(assetsToWithdraw + assetsToDeallocate);
      expect(plan.maxExitAssets).toBeGreaterThanOrEqual(0n);

      // Penalty-free leg: VaultV2.withdraw pulls the shortfall over idle from the liquidity adapter.
      const drained = MathLib.zeroFloorSub(assetsToWithdraw, s.assetBalance);
      if (drained > 0n) withdrawFrom(liquidityMarket, drained);
      const legs: bigint[] = [assetsToWithdraw];
      let remaining = assetsToDeallocate;
      let penaltyAssets = 0n;
      for (const m of markets) {
        if (remaining === 0n) break;
        const assets = min(available(m), remaining);
        remaining -= assets;
        if (assets === 0n) continue;
        withdrawFrom(m, assets);
        const penaltyLeg = mulDivUp(assets, s.penalty, WAD);
        penaltyAssets += penaltyLeg;
        legs.push(penaltyLeg);
      }
      // The contract loop runs past the market list (and reverts) exactly when coverage is short.
      expect(remaining === 0n).toBe(plan.coveredAssets >= assetsToDeallocate);
      if (remaining > 0n) return;
      expect(penaltyAssets).toBeLessThanOrEqual(plan.penaltyAssets);
      legs.push(assetsToDeallocate);

      let supply = totalSupply;
      let vaultAssets = totalAssets;
      let sharesBurnt = 0n;
      for (const assets of legs) {
        const burnt = mulDivUp(
          assets,
          supply + s.virtualShares,
          vaultAssets + 1n,
        );
        supply -= burnt;
        vaultAssets -= assets;
        sharesBurnt += burnt;
      }
      const maxSharesBurnt = computeVaultV2ForceWithdrawSharesBurnt({
        vaultData,
        deadlineVaultData: vaultData,
        plan,
      });
      expect(sharesBurnt).toBeLessThanOrEqual(maxSharesBurnt);
      expect(
        computeVaultV2ForceWithdrawMinSharesBurnt({ vaultData, plan }),
      ).toBeLessThanOrEqual(sharesBurnt);

      // The slippage floor from the burn upper bound never reverts the faithful exit.
      const withdrawn = plan.withdrawnAssets;
      fc.pre(
        sharesBurnt > 0n &&
          mulDivDown(
            withdrawn,
            (WAD - s.tolerance) * 10n ** 9n,
            maxSharesBurnt,
          ) > 0n,
      );
      const minSharePriceE27 = computeMinForceWithdrawSharePrice({
        withdrawnAssets: withdrawn,
        sharesBurnt: maxSharesBurnt,
        slippageTolerance: s.tolerance,
      });
      expect(mulDivDown(withdrawn, RAY, sharesBurnt)).toBeGreaterThanOrEqual(
        minSharePriceE27,
      );
    },
  );
});
