import { describe, expect, test } from "vitest";
import { Time } from "./time.js";

describe("Time — unit conversion matrix", () => {
  describe("from larger to smaller (multiplication)", () => {
    test("s ↔ ms", () => {
      expect(Time.ms.from.s(1)).toBe(1000);
      expect(Time.ms.from.s(1n)).toBe(1000n);
    });
    test("min ↔ s, ms", () => {
      expect(Time.s.from.min(1)).toBe(60);
      expect(Time.ms.from.min(1)).toBe(60_000);
    });
    test("h ↔ min, s, ms", () => {
      expect(Time.min.from.h(1)).toBe(60);
      expect(Time.s.from.h(1)).toBe(3_600);
      expect(Time.ms.from.h(1)).toBe(3_600_000);
    });
    test("d ↔ h, min, s, ms", () => {
      expect(Time.h.from.d(1)).toBe(24);
      expect(Time.min.from.d(1)).toBe(1_440);
      expect(Time.s.from.d(1)).toBe(86_400);
      expect(Time.ms.from.d(1)).toBe(86_400_000);
    });
    test("w → d (7 days/week)", () => {
      expect(Time.d.from.w(1)).toBe(7);
      expect(Time.d.from.w(2)).toBe(14);
    });
    test("mo → d (31 days/month)", () => {
      expect(Time.d.from.mo(1)).toBe(31);
    });
    test("y → d (365 days/year)", () => {
      expect(Time.d.from.y(1)).toBe(365);
    });
  });

  describe("from smaller to larger (integer division)", () => {
    test("ms → s truncates remainder (bigint)", () => {
      expect(Time.s.from.ms(1999n)).toBe(1n);
      expect(Time.s.from.ms(2000n)).toBe(2n);
    });
    test("ms → s preserves number type for number input", () => {
      // Passing a number returns a number (not bigint).
      const r = Time.s.from.ms(2000);
      expect(typeof r).toBe("number");
      expect(r).toBe(2);
    });
    test("s → min truncates remainder", () => {
      expect(Time.min.from.s(59n)).toBe(0n);
      expect(Time.min.from.s(120n)).toBe(2n);
    });
    test("d → y", () => {
      expect(Time.y.from.d(364n)).toBe(0n);
      expect(Time.y.from.d(365n)).toBe(1n);
      expect(Time.y.from.d(730n)).toBe(2n);
    });
  });

  describe("identity (same unit)", () => {
    test("returns the input value verbatim for both number and bigint", () => {
      expect(Time.s.from.s(42n)).toBe(42n);
      expect(Time.s.from.s(42)).toBe(42);
      expect(Time.h.from.h(7)).toBe(7);
    });
  });

  describe("number/bigint type preservation", () => {
    test("bigint input → bigint output (multiplication)", () => {
      const r = Time.ms.from.s(5n);
      expect(typeof r).toBe("bigint");
      expect(r).toBe(5_000n);
    });
    test("number input → number output (multiplication)", () => {
      const r = Time.ms.from.s(5);
      expect(typeof r).toBe("number");
      expect(r).toBe(5_000);
    });
    test("bigint input → bigint output (division)", () => {
      const r = Time.s.from.ms(5_000n);
      expect(typeof r).toBe("bigint");
      expect(r).toBe(5n);
    });
    test("number input → number output (division)", () => {
      const r = Time.s.from.ms(5_000);
      expect(typeof r).toBe("number");
      expect(r).toBe(5);
    });
  });

  describe("large values", () => {
    test("year → ms produces the expected millisecond count", () => {
      expect(Time.ms.from.y(1n)).toBe(31_536_000_000n);
    });
    test("survives extremely large bigints without precision loss", () => {
      expect(Time.s.from.y(10_000_000_000n)).toBe(
        10_000_000_000n * 365n * 24n * 60n * 60n,
      );
    });
  });
});

describe("Time.fromPeriod", () => {
  test("converts a single-unit period (string form) using duration=1", () => {
    expect(Time.ms.fromPeriod("s")).toBe(1000);
    expect(Time.s.fromPeriod("min")).toBe(60);
  });

  test("converts a Period object with custom duration", () => {
    expect(Time.ms.fromPeriod({ unit: "s", duration: 123 })).toBe(123_000);
  });

  test("rounds down when converting to a coarser unit", () => {
    expect(Time.min.fromPeriod({ unit: "s", duration: 123 })).toBe(2);
  });

  test("identity period (same unit) returns the duration verbatim", () => {
    expect(Time.s.fromPeriod({ unit: "s", duration: 42 })).toBe(42);
  });

  test("returns 0 when the duration is smaller than one of the target unit", () => {
    expect(Time.h.fromPeriod({ unit: "s", duration: 30 })).toBe(0);
  });
});

describe("Time.toPeriod", () => {
  test("expands a unit string to a duration=1 period", () => {
    expect(Time.toPeriod("s")).toEqual({ unit: "s", duration: 1 });
    expect(Time.toPeriod("y")).toEqual({ unit: "y", duration: 1 });
  });

  test("returns the period object unchanged when given an object", () => {
    const period = { unit: "min" as const, duration: 30 };
    expect(Time.toPeriod(period)).toBe(period);
  });
});

describe("Time.wait", () => {
  test("resolves after the specified ms delay", async () => {
    const start = Date.now();
    await Time.wait(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  test("resolves with the provided value", async () => {
    expect(await Time.wait(0, "done")).toBe("done");
  });

  test("resolves with undefined when no value provided", async () => {
    expect(await Time.wait(0)).toBe(undefined);
  });
});

describe("Time.timestamp", () => {
  test("returns a bigint approximating Date.now()/1000", () => {
    const ts = Time.timestamp();
    expect(typeof ts).toBe("bigint");
    const now = BigInt(Math.ceil(Date.now() / 1_000));
    // Allow a few seconds of drift.
    expect(ts >= now - 2n && ts <= now + 2n).toBe(true);
  });

  test("matches Math.ceil(Date.now()/1000)", () => {
    const before = Math.ceil(Date.now() / 1_000);
    const ts = Time.timestamp();
    const after = Math.ceil(Date.now() / 1_000);
    expect(ts).toBeGreaterThanOrEqual(BigInt(before));
    expect(ts).toBeLessThanOrEqual(BigInt(after));
  });
});
