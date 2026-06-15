import { MathLib } from "@morpho-org/morpho-ts";
import { describe, expect, test } from "vitest";

import { addresses, baseMarketInput, marketId } from "../__test__/fixtures.js";
import {
  InvalidPositionAccrualTimestampError,
  InvalidPositionLossFactorError,
} from "../errors.js";
import { AccrualPosition, type IPosition } from "./Position.js";

const basePositionInput = (overrides: Partial<IPosition> = {}): IPosition => ({
  credit: overrides.credit ?? 1_000n,
  pendingFee: overrides.pendingFee ?? 100n,
  lastLossFactor: overrides.lastLossFactor ?? 0n,
  lastAccrual: overrides.lastAccrual ?? 1_000n,
  debt: overrides.debt ?? 0n,
  collateralBitmap: overrides.collateralBitmap ?? 1n,
  collateral:
    overrides.collateral ??
    Array.from({ length: 128 }, (_, index) => (index === 0 ? 123n : 0n)),
});

describe("Position", () => {
  test("default", () => {
    const position = new AccrualPosition(
      basePositionInput(),
      baseMarketInput(),
    );

    expect(position.faceValue).toBe(900n);
    expect(
      position.getCollateralBalanceByToken(addresses.collateralToken),
    ).toBe(123n);
    expect(position.getCollateralBalanceByIndex(1)).toBeUndefined();
    expect(position.market.id).toBe(marketId);
  });
});

describe("AccrualPosition.accrueInterest", () => {
  test("default", () => {
    const accrued = new AccrualPosition(
      basePositionInput(),
      baseMarketInput(),
    ).accrueInterest(1_500n);

    expect(accrued.credit).toBe(950n);
    expect(accrued.pendingFee).toBe(50n);
    expect(accrued.lastLossFactor).toBe(0n);
    expect(accrued.lastAccrual).toBe(1_500n);
    expect(accrued.market.continuousFeeCredit).toBe(50n);
  });

  test("behavior: post-maturity accrues only until maturity", () => {
    const accrued = new AccrualPosition(
      basePositionInput(),
      baseMarketInput(),
    ).accrueInterest(2_500n);

    expect(accrued.credit).toBe(900n);
    expect(accrued.pendingFee).toBe(0n);
    expect(accrued.lastAccrual).toBe(2_500n);
    expect(accrued.market.continuousFeeCredit).toBe(100n);
  });

  test("behavior: bad-debt slashing reduces credit and pending fee before accrual", () => {
    const lossFactor = MathLib.MAX_UINT_128 / 2n;
    const accrued = new AccrualPosition(basePositionInput(), {
      ...baseMarketInput(),
      lossFactor,
    }).accrueInterest(1_500n);

    expect(accrued.credit).toBe(475n);
    expect(accrued.pendingFee).toBe(25n);
    expect(accrued.lastLossFactor).toBe(lossFactor);
    expect(accrued.market.continuousFeeCredit).toBe(25n);
  });

  test("behavior: zero credit syncs loss factor without fee accrual", () => {
    const lossFactor = MathLib.MAX_UINT_128 / 2n;
    const accrued = new AccrualPosition(
      basePositionInput({ credit: 0n, pendingFee: 0n }),
      {
        ...baseMarketInput(),
        lossFactor,
      },
    ).accrueInterest(1_500n);

    expect(accrued.credit).toBe(0n);
    expect(accrued.pendingFee).toBe(0n);
    expect(accrued.lastLossFactor).toBe(lossFactor);
    expect(accrued.market.continuousFeeCredit).toBe(0n);
  });

  test("error: InvalidPositionAccrualTimestampError", () => {
    expect(() =>
      new AccrualPosition(
        basePositionInput(),
        baseMarketInput(),
      ).accrueInterest(999n),
    ).toThrow(InvalidPositionAccrualTimestampError);
  });

  test("error: InvalidPositionLossFactorError", () => {
    expect(() =>
      new AccrualPosition(
        basePositionInput({ lastLossFactor: 2n }),
        baseMarketInput(),
      ).accrueInterest(1_500n),
    ).toThrow(InvalidPositionLossFactorError);
  });
});
