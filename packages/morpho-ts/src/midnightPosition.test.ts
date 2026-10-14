import { describe, expect, test, vi } from "vitest";
import {
  InvalidPositionAccrualStateError,
  InvalidPositionAccrualTimestampError,
  InvalidPositionLossFactorError,
} from "./errors.js";
import { MathLib } from "./math.js";
import { MidnightPositionLib } from "./midnightPosition.js";

const sameError = (error: Error) =>
  expect.objectContaining({
    constructor: error.constructor,
    message: error.message,
  });

const baseParams = (
  overrides: Partial<{
    credit: bigint;
    pendingFee: bigint;
    lastLossFactor: bigint;
    lastAccrual: bigint;
    marketLossFactor: bigint;
    maturity: bigint;
    timestamp: bigint;
  }> = {},
) => ({
  credit: 1_000n,
  pendingFee: 100n,
  lastLossFactor: 0n,
  lastAccrual: 100n,
  marketLossFactor: 0n,
  maturity: 1_100n,
  timestamp: 100n,
  ...overrides,
});

describe("MidnightPositionLib.accrue", () => {
  test("behavior: is a no-op at the last accrual timestamp", () => {
    expect(MidnightPositionLib.accrue(baseParams())).toEqual({
      credit: 1_000n,
      pendingFee: 100n,
      accruedFee: 0n,
    });
  });

  test("behavior: accrues the continuous fee before maturity", () => {
    expect(MidnightPositionLib.accrue(baseParams({ timestamp: 600n }))).toEqual(
      {
        credit: 950n,
        pendingFee: 50n,
        accruedFee: 50n,
      },
    );
  });

  test("behavior: does not accrue when last accrual is at or after maturity", () => {
    expect(
      MidnightPositionLib.accrue(
        baseParams({ lastAccrual: 1_100n, timestamp: 1_200n }),
      ),
    ).toEqual({
      credit: 1_000n,
      pendingFee: 100n,
      accruedFee: 0n,
    });
  });

  test("behavior: clamps accrual to maturity when timestamp is later", () => {
    expect(
      MidnightPositionLib.accrue(baseParams({ timestamp: 1_200n })),
    ).toEqual({
      credit: 900n,
      pendingFee: 0n,
      accruedFee: 100n,
    });
  });

  test("behavior: fully wipes credit at the maximum loss factor", () => {
    const maxLossFactor = MathLib.MAX_UINT_128;

    expect(
      MidnightPositionLib.accrue(
        baseParams({
          lastLossFactor: maxLossFactor,
          marketLossFactor: maxLossFactor,
        }),
      ),
    ).toEqual({
      credit: 0n,
      pendingFee: 0n,
      accruedFee: 0n,
    });
  });

  test("behavior: rounds the pending-fee decrease up after a partial slash", () => {
    expect(
      MidnightPositionLib.accrue(
        baseParams({
          credit: 7n,
          pendingFee: 3n,
          marketLossFactor: 1n,
        }),
      ),
    ).toEqual({
      credit: 6n,
      pendingFee: 2n,
      accruedFee: 0n,
    });
  });

  test("behavior: accrues fees after a partial slash", () => {
    expect(
      MidnightPositionLib.accrue(
        baseParams({
          marketLossFactor: MathLib.MAX_UINT_128 / 2n,
          timestamp: 600n,
        }),
      ),
    ).toEqual({
      credit: 475n,
      pendingFee: 25n,
      accruedFee: 25n,
    });
  });

  test("behavior: keeps pending fee at zero when credit is zero", () => {
    expect(
      MidnightPositionLib.accrue(
        baseParams({
          credit: 0n,
          pendingFee: 0n,
          marketLossFactor: 1n,
          timestamp: 600n,
        }),
      ),
    ).toEqual({
      credit: 0n,
      pendingFee: 0n,
      accruedFee: 0n,
    });
  });

  test("behavior: accepts bigint-compatible input values", () => {
    expect(
      MidnightPositionLib.accrue({
        credit: "1000",
        pendingFee: 100,
        lastLossFactor: 0n,
        lastAccrual: "100",
        marketLossFactor: 0,
        maturity: "1100",
        timestamp: 600n,
      }),
    ).toEqual({
      credit: 950n,
      pendingFee: 50n,
      accruedFee: 50n,
    });
  });

  test("error: timestamp before last accrual", () => {
    expect(() =>
      MidnightPositionLib.accrue(baseParams({ timestamp: 99n })),
    ).toThrow(sameError(new InvalidPositionAccrualTimestampError(99n, 100n)));
  });

  test("error: market loss factor before position loss factor", () => {
    expect(() =>
      MidnightPositionLib.accrue(
        baseParams({ lastLossFactor: 2n, marketLossFactor: 1n }),
      ),
    ).toThrow(sameError(new InvalidPositionLossFactorError(1n, 2n)));
  });

  test("error: pending fee exceeds credit", () => {
    expect(() =>
      MidnightPositionLib.accrue(
        baseParams({ credit: 100n, pendingFee: 101n }),
      ),
    ).toThrow(
      sameError(
        new InvalidPositionAccrualStateError(
          "Pending fee must be less than or equal to credit.",
        ),
      ),
    );
  });

  test.each([
    {
      name: "negative credit",
      overrides: { credit: -1n },
      reason: 'Credit "-1" must be non-negative.',
    },
    {
      name: "negative pending fee",
      overrides: { credit: 0n, pendingFee: -1n },
      reason: 'Pending fee "-1" must be non-negative.',
    },
    {
      name: "negative position loss factor",
      overrides: { lastLossFactor: -1n },
      reason: 'Last loss factor "-1" must be non-negative.',
    },
    {
      name: "negative last accrual",
      overrides: { lastAccrual: -1n },
      reason: 'Last accrual "-1" must be non-negative.',
    },
    {
      name: "negative maturity",
      overrides: { lastAccrual: 0n, maturity: -1n, timestamp: 0n },
      reason: 'Maturity "-1" must be non-negative.',
    },
    {
      name: "market loss factor above MAX_UINT_128",
      overrides: { marketLossFactor: MathLib.MAX_UINT_128 + 1n },
      reason: `Market loss factor "${MathLib.MAX_UINT_128 + 1n}" must not exceed MAX_UINT_128 "${MathLib.MAX_UINT_128}".`,
    },
  ])("error: $name", ({ overrides, reason }) => {
    expect(() => MidnightPositionLib.accrue(baseParams(overrides))).toThrow(
      sameError(new InvalidPositionAccrualStateError(reason)),
    );
  });

  test("error: post-slash credit exceeds stored credit", () => {
    const mulDivDown = vi.spyOn(MathLib, "mulDivDown");
    mulDivDown.mockReturnValueOnce(1_001n);

    try {
      expect(() =>
        MidnightPositionLib.accrue(baseParams({ marketLossFactor: 1n })),
      ).toThrow(
        sameError(
          new InvalidPositionAccrualStateError(
            "Post-slash credit cannot exceed stored credit.",
          ),
        ),
      );
    } finally {
      mulDivDown.mockRestore();
    }
  });

  test("error: pending-fee decrease exceeds pending fee", () => {
    const mulDivUp = vi.spyOn(MathLib, "mulDivUp");
    mulDivUp.mockReturnValueOnce(101n);

    try {
      expect(() =>
        MidnightPositionLib.accrue(baseParams({ marketLossFactor: 1n })),
      ).toThrow(
        sameError(
          new InvalidPositionAccrualStateError(
            "Pending-fee decrease cannot exceed pending fee.",
          ),
        ),
      );
    } finally {
      mulDivUp.mockRestore();
    }
  });

  test("error: accrued fee exceeds post-slash credit", () => {
    const mulDivDown = vi.spyOn(MathLib, "mulDivDown");
    mulDivDown.mockReturnValueOnce(100n).mockReturnValueOnce(101n);

    try {
      expect(() =>
        MidnightPositionLib.accrue(
          baseParams({
            credit: 100n,
            pendingFee: 100n,
            timestamp: 600n,
          }),
        ),
      ).toThrow(
        sameError(
          new InvalidPositionAccrualStateError(
            "Accrued fee cannot exceed post-slash credit or pending fee.",
          ),
        ),
      );
    } finally {
      mulDivDown.mockRestore();
    }
  });
});

describe("MidnightPositionLib.netCredit", () => {
  test("behavior: returns accrued credit minus accrued pending fee", () => {
    expect(MidnightPositionLib.netCredit(baseParams({ timestamp: 600n }))).toBe(
      900n,
    );
  });
});
