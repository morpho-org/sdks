import { MathLib } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_FOREIGN_ADAPTER,
  IN_KIND_USER,
  vaultV2ExitData,
} from "../../test/fixtures/inKindRedeem.js";
import { previewVaultV2ForceWithdraw } from "./previewVaultV2ForceWithdraw.js";
import {
  computeVaultV2ForceWithdrawPlan,
  computeVaultV2ForceWithdrawSharesBurnt,
  resolveVaultV2ForceWithdrawEligibility,
} from "./vaultV2ForceWithdrawPlan.js";

const TWO_PERCENT = 20_000_000_000_000_000n;
const TEN_PERCENT = 100_000_000_000_000_000n;

describe("previewVaultV2ForceWithdraw", () => {
  test("default", () => {
    const preview = previewVaultV2ForceWithdraw(
      vaultV2ExitData({ penalty: TWO_PERCENT }),
      { requestedExitAssets: 51n, timestamp: 0n },
    );

    expect(preview).toEqual({
      maxExitAssets: 103n,
      exitAssets: 51n,
      remainingExitAssets: 0n,
      assetsToWithdraw: 0n,
      assetsToDeallocate: 50n,
      penaltyAssets: 1n,
      referralFeeAssets: 0n,
      netAssets: 50n,
    });
  });

  test("behavior: netAssets is below exitAssets whenever a penalty applies", () => {
    const preview = previewVaultV2ForceWithdraw(
      vaultV2ExitData({ penalty: TWO_PERCENT }),
      { requestedExitAssets: 51n, timestamp: 0n },
    );

    expect(preview?.netAssets).toBeLessThan(51n);
  });

  test("behavior: netAssets equals exitAssets at a zero penalty", () => {
    const preview = previewVaultV2ForceWithdraw(
      vaultV2ExitData({ penalty: 0n }),
      { requestedExitAssets: 51n, timestamp: 0n },
    );

    expect(preview).toMatchObject({
      exitAssets: 51n,
      assetsToDeallocate: 51n,
      penaltyAssets: 0n,
      netAssets: 51n,
    });
  });

  test("behavior: caps the request at maxExitAssets and reports the remainder", () => {
    const preview = previewVaultV2ForceWithdraw(
      vaultV2ExitData({ penalty: TWO_PERCENT }),
      { requestedExitAssets: 500n, timestamp: 0n },
    );

    expect(preview).toMatchObject({
      maxExitAssets: 103n,
      exitAssets: 103n,
      remainingExitAssets: 397n,
    });
  });

  test("behavior: the capped exit stays within the adapter's capacity", () => {
    const preview = previewVaultV2ForceWithdraw(
      vaultV2ExitData({ penalty: TWO_PERCENT }),
      { requestedExitAssets: 500n, timestamp: 0n },
    );

    // The market can only release 100; the capped exit must not ask for more.
    expect(preview?.assetsToDeallocate).toBe(100n);
  });

  test("behavior: splits the penalty-free and penalised legs", () => {
    const preview = previewVaultV2ForceWithdraw(
      vaultV2ExitData({ assetBalance: 20n, penalty: TWO_PERCENT }),
      { requestedExitAssets: 71n, timestamp: 0n },
    );

    expect(preview).toMatchObject({
      assetsToWithdraw: 20n,
      // floor(51 / 1.02) === 50
      assetsToDeallocate: 50n,
      netAssets: 70n,
    });
  });

  test("behavior: quotes the tight per-leg penalty, not the allowance bound", () => {
    // Both markets fully liquid (1000 + 500), so a 1_400 exit spans two force-deallocation legs.
    const vaultData = vaultV2ExitData({
      additionalMarket: true,
      marketTotalBorrowAssets: 0n,
      secondMarketTotalBorrowAssets: 0n,
      penalty: TWO_PERCENT,
    });
    const preview = previewVaultV2ForceWithdraw(vaultData, {
      requestedExitAssets: 1_400n,
      timestamp: 0n,
    });
    const eligibility = resolveVaultV2ForceWithdrawEligibility(vaultData);
    if (eligibility.type !== "eligible") {
      throw new Error(
        `Expected an eligible fixture, got "${eligibility.type}"`,
      );
    }
    const plan = computeVaultV2ForceWithdrawPlan({
      vaultData,
      adapter: eligibility.adapter,
      liquidityMarketId: eligibility.liquidityMarketId,
      exitAssets: preview?.exitAssets ?? 0n,
      timestamp: 0n,
    });

    expect(plan.penaltyLegs).toBe(2);
    // The tight `ceil(assetsToDeallocate × penalty)`, exact for the on-chain single-market charge.
    expect(preview?.penaltyAssets).toBe(
      MathLib.wMulUp(plan.assetsToDeallocate, TWO_PERCENT),
    );
    // Strictly below the `+ (penaltyLegs - 1)` allowance bound the plan carries for approvals.
    expect(preview?.penaltyAssets).toBeLessThan(plan.penaltyAssets);
    // The displayed split never claims a larger debit than the penalty-inclusive exit — the bound
    // would (1_372 + 29 > 1_400).
    expect(
      (preview?.assetsToWithdraw ?? 0n) +
        (preview?.assetsToDeallocate ?? 0n) +
        (preview?.penaltyAssets ?? 0n),
    ).toBeLessThanOrEqual(preview?.exitAssets ?? 0n);
  });

  test("behavior: deducts the referral fee from the net assets", () => {
    const preview = previewVaultV2ForceWithdraw(
      vaultV2ExitData({ assetBalance: 100n, penalty: 0n }),
      {
        requestedExitAssets: 100n,
        timestamp: 0n,
        referralFeePct: TEN_PERCENT,
      },
    );

    expect(preview).toMatchObject({
      assetsToWithdraw: 100n,
      referralFeeAssets: 10n,
      netAssets: 90n,
    });
  });

  test("behavior: accepts an explicit adapter override", () => {
    const vaultData = vaultV2ExitData({ penalty: TWO_PERCENT });
    const adapter = vaultData.accrualAdapters[0]?.address;

    expect(
      previewVaultV2ForceWithdraw(vaultData, {
        requestedExitAssets: 51n,
        timestamp: 0n,
        adapter,
      }),
    ).toMatchObject({ netAssets: 50n });
  });

  test.each([
    ["a non-positive request", { requestedExitAssets: 0n }],
    ["an unknown adapter override", { adapter: IN_KIND_FOREIGN_ADAPTER }],
  ] as const)("behavior: returns undefined for %s", (_label, overrides) => {
    expect(
      previewVaultV2ForceWithdraw(vaultV2ExitData(), {
        requestedExitAssets: 51n,
        timestamp: 0n,
        ...overrides,
      }),
    ).toBeUndefined();
  });

  test.each(["empty", "legacy"] as const)(
    "behavior: returns undefined for an %s adapter layout",
    (adapters) => {
      expect(
        previewVaultV2ForceWithdraw(vaultV2ExitData({ adapters }), {
          requestedExitAssets: 51n,
          timestamp: 0n,
        }),
      ).toBeUndefined();
    },
  );

  test.each(["foreign", "undecodable"] as const)(
    "behavior: returns undefined for a %s liquidity adapter",
    (liquidityAdapter) => {
      expect(
        previewVaultV2ForceWithdraw(vaultV2ExitData({ liquidityAdapter }), {
          requestedExitAssets: 51n,
          timestamp: 0n,
        }),
      ).toBeUndefined();
    },
  );

  test("behavior: returns undefined when the exit would withdraw nothing", () => {
    expect(
      previewVaultV2ForceWithdraw(vaultV2ExitData({ penalty: TWO_PERCENT }), {
        requestedExitAssets: 1n,
        timestamp: 0n,
      }),
    ).toBeUndefined();
  });

  test("behavior: returns undefined when the vault holds no exitable assets", () => {
    expect(
      previewVaultV2ForceWithdraw(vaultV2ExitData({ supplyShares: 0n }), {
        requestedExitAssets: 51n,
        timestamp: 0n,
      }),
    ).toBeUndefined();
  });

  // A vault whose `totalSupply` dwarfs `totalAssets` has a share price that rounds the realized
  // exit price down to zero, offering no slippage protection. The entity rejects such an exit with
  // `VaultV2ForceWithdrawZeroSharePriceError`, so the preview must not hand back a usable
  // `exitAssets` for it.
  test("behavior: returns undefined when the realized share price rounds to zero", () => {
    expect(
      previewVaultV2ForceWithdraw(
        vaultV2ExitData({
          penalty: 0n,
          assetBalance: 1n,
          totalAssets: 1n,
          totalSupply: 10n ** 40n,
        }),
        { requestedExitAssets: 1n, timestamp: 0n },
      ),
    ).toBeUndefined();
  });

  // Tighter regime than the test above: the zero-slippage price here is a positive `1n`, so a
  // tolerance-free screen would clear it — but `forceWithdraw()` applies `DEFAULT_SLIPPAGE_TOLERANCE`
  // by default, which scales that floor below 1 and rounds it to zero, throwing
  // `VaultV2ForceWithdrawZeroSharePriceError`. The preview must mirror the default tolerance and
  // decline, not hand back an `exitAssets` the default call rejects.
  test("behavior: returns undefined when only the default-tolerance floor rounds to zero", () => {
    const vaultData = vaultV2ExitData({
      penalty: 0n,
      assetBalance: 1_000_000n,
      totalAssets: 1_000_000n,
      totalSupply: 1_000_000n * MathLib.RAY,
    });
    const params = { requestedExitAssets: 1_000_000n, timestamp: 0n } as const;

    // Guard the regime: this fixture's tolerance-free price is strictly positive, so the exit is
    // declined by the default-tolerance screen — not by the coarser zero-slippage one above.
    const eligibility = resolveVaultV2ForceWithdrawEligibility(vaultData);
    if (eligibility.type !== "eligible") {
      throw new Error(
        `Expected an eligible fixture, got "${eligibility.type}"`,
      );
    }
    const plan = computeVaultV2ForceWithdrawPlan({
      vaultData,
      adapter: eligibility.adapter,
      liquidityMarketId: eligibility.liquidityMarketId,
      exitAssets: params.requestedExitAssets,
      timestamp: params.timestamp,
    });
    const { vault: accrued } = vaultData.accrueInterest(
      MathLib.max(params.timestamp, vaultData.lastUpdate),
    );
    const sharesBurnt = computeVaultV2ForceWithdrawSharesBurnt({
      vaultData: accrued,
      deadlineVaultData: accrued,
      plan,
    });
    expect(
      MathLib.mulDivDown(plan.withdrawnAssets, MathLib.RAY, sharesBurnt),
    ).toBeGreaterThan(0n);

    expect(previewVaultV2ForceWithdraw(vaultData, params)).toBeUndefined();
  });

  test("behavior: mirrors fee-recipient mints and returns undefined at the lower burn bound", () => {
    const vaultData = vaultV2ExitData({
      managementFee: 40_000_000_000n,
      feeRecipient: IN_KIND_USER,
    });
    const params = {
      requestedExitAssets: 51n,
      timestamp: vaultData.lastUpdate + 30n * 24n * 60n * 60n,
      userAddress: IN_KIND_USER,
    } as const;

    expect(previewVaultV2ForceWithdraw(vaultData, params)).toBeUndefined();
    expect(
      previewVaultV2ForceWithdraw(vaultData, {
        ...params,
        userAddress: undefined,
      }),
    ).toBeDefined();
  });

  test("behavior: non-recipient userAddress preserves the preview", () => {
    const vaultData = vaultV2ExitData({
      managementFee: 40_000_000_000n,
      feeRecipient: IN_KIND_FOREIGN_ADAPTER,
    });
    const params = {
      requestedExitAssets: 51n,
      timestamp: vaultData.lastUpdate + 30n * 24n * 60n * 60n,
    } as const;

    expect(
      previewVaultV2ForceWithdraw(vaultData, {
        ...params,
        userAddress: IN_KIND_USER,
      }),
    ).toEqual(previewVaultV2ForceWithdraw(vaultData, params));
  });

  // Out of range the transaction path rejects, so quoting a payout here would overstate what the
  // user receives (negative fee) or promise a non-positive one (at or above WAD).
  test.each([-1n, MathLib.WAD, MathLib.WAD + 1n])(
    "behavior: returns undefined for a referralFeePct of %s",
    (referralFeePct) => {
      expect(
        previewVaultV2ForceWithdraw(vaultV2ExitData({ penalty: TWO_PERCENT }), {
          requestedExitAssets: 51n,
          timestamp: 0n,
          referralFeePct,
        }),
      ).toBeUndefined();
    },
  );
});
