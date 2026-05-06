import type { Hex } from "viem";
import type { RawLog } from "../types.js";
import { makeCall } from "./make-call.js";

const log: RawLog = {
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  topics: ["0xaaaa" as Hex],
  data: "0xdeadbeef" as Hex,
};

describe("makeCall", () => {
  test("default: wraps logs with success status and zero gas/return", () => {
    const result = makeCall([log]);
    expect(result.logs).toEqual([log]);
    expect(result.status).toBe(true);
    expect(result.returnData).toBe("0x");
    expect(result.gasUsed).toBe(0n);
    expect(result.assetChanges).toBeUndefined();
  });

  test("behavior: overrides take precedence over defaults", () => {
    const result = makeCall([log], {
      status: false,
      returnData: "0xabcd" as Hex,
      gasUsed: 21_000n,
      assetChanges: { foo: "bar" },
    });
    expect(result.status).toBe(false);
    expect(result.returnData).toBe("0xabcd");
    expect(result.gasUsed).toBe(21_000n);
    expect(result.assetChanges).toEqual({ foo: "bar" });
  });

  test("behavior: empty logs array", () => {
    expect(makeCall([]).logs).toEqual([]);
  });
});
