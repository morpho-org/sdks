import { Time } from "./time";

describe("time", () => {
  it("Should resolve after 1 second", async () => {
    const start = Date.now();
    await Time.wait(1000);
    const end = Date.now();
    expect(end - start).toBeGreaterThanOrEqual(999); // Faced some cases where it was waiting for 999ms
  });

  it("should convert ms to s", () => {
    const ms = 123456789999n;
    expect(Time.s.from.ms(ms)).toBe(123456789n);
  });

  it("should convert s to ms", () => {
    const s = 123456789444n;
    expect(Time.ms.from.s(s)).toBe(123456789444000n);
  });
});
