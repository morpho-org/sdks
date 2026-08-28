import { MathLib } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_FOREIGN_ADAPTER,
  vaultV2ExitData,
} from "../../test/fixtures/inKindRedeem.js";
import { previewVaultV2ForceWithdraw } from "./previewVaultV2ForceWithdraw.js";

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
