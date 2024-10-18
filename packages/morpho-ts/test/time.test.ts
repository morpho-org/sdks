import { Time } from "../src";

import { describe, expect, test } from "vitest";

describe("time", () => {
  test("Should resolve after 1 second", async () => {
    const start = Date.now();
    await Time.wait(1000);
    const end = Date.now();
    expect(end - start).toBeGreaterThanOrEqual(999); // Faced some cases where it was waiting for 999ms
  });

  test("should convert ms to s", () => {
    const ms = 123456789999n;
    expect(Time.s.from.ms(ms)).toBe(123456789n);
  });

  test("should convert s to ms", () => {
    const s = 123456789444n;
    expect(Time.ms.from.s(s)).toBe(123456789444000n);
  });

  test("should convert period to s", () => {
    expect(Time.ms.fromPeriod("s")).toBe(1000);
    expect(Time.ms.fromPeriod({ unit: "s", duration: 123 })).toBe(123000);
    expect(Time.min.fromPeriod({ unit: "s", duration: 123 })).toBe(2);
  });
});
