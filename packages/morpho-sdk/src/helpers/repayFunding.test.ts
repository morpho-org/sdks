import { Market, MarketParams } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import { WethUsdsBlue } from "../../test/fixtures/blue.js";
import { NativeAmountExceedsTransferAmountError } from "../types/index.js";
import {
  computeRepayAccrualTimestamp,
  computeSharesRepayFunding,
  REPAY_ACCRUAL_BUFFER,
} from "./repayFunding.js";

const LAST_UPDATE = 1_700_000_000n;

/** Accruing market (rateAtTarget set): forward accrual actually grows the debt. */
const ratedMarket = new Market({
  params: new MarketParams(WethUsdsBlue),
  totalSupplyAssets: 10n ** 24n,
  totalBorrowAssets: 10n ** 24n / 2n,
  totalSupplyShares: 10n ** 24n,
  totalBorrowShares: 10n ** 24n / 2n,
  lastUpdate: LAST_UPDATE,
  fee: 0n,
  price: 10n ** 36n,
  rateAtTarget: 10n ** 9n, // ~3% APR per-second WAD rate
});

const SHARES = 10n ** 18n;

describe("computeRepayAccrualTimestamp", () => {
  test("default", () => {
    const now = LAST_UPDATE + 100n;
    expect(computeRepayAccrualTimestamp({ now, lastUpdate: LAST_UPDATE })).toBe(
      now + REPAY_ACCRUAL_BUFFER,
    );
  });

  test("behavior: clamps a stale clock to the market's lastUpdate", () => {
    expect(
      computeRepayAccrualTimestamp({
        now: LAST_UPDATE - 100n,
        lastUpdate: LAST_UPDATE,
      }),
    ).toBe(LAST_UPDATE + REPAY_ACCRUAL_BUFFER);
  });
});

describe("computeSharesRepayFunding", () => {
  test("default", () => {
    const now = LAST_UPDATE + 100n;
    const { accrualTimestamp, accruedMarket, transferAmount, erc20Amount } =
      computeSharesRepayFunding({ market: ratedMarket, shares: SHARES, now });

    expect(accrualTimestamp).toBe(now + REPAY_ACCRUAL_BUFFER);
    expect(transferAmount).toBe(accruedMarket.toBorrowAssets(SHARES, "Up"));
    // The buffered transfer exceeds the unaccrued debt (interest headroom).
    expect(transferAmount).toBeGreaterThan(
      ratedMarket.toBorrowAssets(SHARES, "Up"),
    );
    // nativeAmount defaults to 0n: the whole transfer is pulled as ERC-20.
    expect(erc20Amount).toBe(transferAmount);
  });

  test("behavior: deterministic for a fixed `now`, grows as `now` advances", () => {
    const now = LAST_UPDATE + 100n;
    const first = computeSharesRepayFunding({
      market: ratedMarket,
      shares: SHARES,
      now,
    });
    const second = computeSharesRepayFunding({
      market: ratedMarket,
      shares: SHARES,
      now,
    });
    expect(second.transferAmount).toBe(first.transferAmount);
    expect(second.erc20Amount).toBe(first.erc20Amount);

    const later = computeSharesRepayFunding({
      market: ratedMarket,
      shares: SHARES,
      now: now + 3_600n,
    });
    expect(later.transferAmount).toBeGreaterThan(first.transferAmount);
  });

  test("behavior: nativeAmount is carved out of the ERC-20 pull", () => {
    const now = LAST_UPDATE + 100n;
    const nativeAmount = 10n ** 15n;
    const { transferAmount, erc20Amount } = computeSharesRepayFunding({
      market: ratedMarket,
      shares: SHARES,
      nativeAmount,
      now,
    });
    expect(erc20Amount).toBe(transferAmount - nativeAmount);
  });

  test("behavior: a fully native funding pulls no ERC-20", () => {
    const now = LAST_UPDATE + 100n;
    const { transferAmount } = computeSharesRepayFunding({
      market: ratedMarket,
      shares: SHARES,
      now,
    });
    const { erc20Amount } = computeSharesRepayFunding({
      market: ratedMarket,
      shares: SHARES,
      nativeAmount: transferAmount,
      now,
    });
    expect(erc20Amount).toBe(0n);
  });

  test("error: NativeAmountExceedsTransferAmountError", () => {
    const now = LAST_UPDATE + 100n;
    const { transferAmount } = computeSharesRepayFunding({
      market: ratedMarket,
      shares: SHARES,
      now,
    });
    expect(() =>
      computeSharesRepayFunding({
        market: ratedMarket,
        shares: SHARES,
        nativeAmount: transferAmount + 1n,
        now,
      }),
    ).toThrow(NativeAmountExceedsTransferAmountError);
  });
});
