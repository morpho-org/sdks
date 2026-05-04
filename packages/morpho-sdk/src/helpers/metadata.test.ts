import type { Address, Hex } from "viem";
import { afterEach, describe, expect, test, vi } from "vitest";
import { addTransactionMetadata } from "./metadata.js";

const TO: Address = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";

describe("addTransactionMetadata", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns the tx unchanged when data is missing entirely", () => {
    // The implementation short-circuits on `!data`. The literal "0x" is truthy,
    // so the function still processes it; only an empty/undefined data returns
    // the input verbatim.
    const tx = {
      to: TO,
      value: 0n,
      data: "" as unknown as Hex,
    };
    expect(addTransactionMetadata(tx, { origin: "" })).toBe(tx);
  });

  test("appends a 4-byte timestamp when metadata.timestamp is truthy", () => {
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    const result = addTransactionMetadata(tx, {
      origin: "",
      timestamp: true,
    });
    // 0xdeadbeef = 10 chars; +8 hex chars for the 4-byte timestamp.
    expect(result.data.startsWith("0xdeadbeef")).toBe(true);
    expect(result.data.length).toBe(10 + 8);
  });

  test("appends a raw-hex origin (no 0x prefix)", () => {
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    const result = addTransactionMetadata(tx, { origin: "cafe" });
    // No timestamp, just origin. data + "cafe" appended.
    expect(result.data).toBe("0xdeadbeefcafe");
  });

  test("warns and skips an origin with a 0x prefix (current implementation does not normalize it)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    const result = addTransactionMetadata(tx, { origin: "0xcafe" });
    expect(result.data).toBe("0xdeadbeef");
    expect(warn).toHaveBeenCalled();
  });

  test("warns and skips invalid origin (non-hex characters)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    const result = addTransactionMetadata(tx, { origin: "not-hex!" });
    // Origin is rejected; only the original data remains (plus any timestamp).
    expect(result.data).toBe("0xdeadbeef");
    expect(warn).toHaveBeenCalled();
  });

  test("warns and skips origin longer than 8 hex chars", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    const result = addTransactionMetadata(tx, {
      origin: "0xdeadbeef00",
    });
    expect(result.data).toBe("0xdeadbeef");
    expect(warn).toHaveBeenCalled();
  });

  test("preserves to and value fields", () => {
    const tx = { to: TO, value: 123n, data: "0xab" as Hex };
    const result = addTransactionMetadata(tx, { origin: "" });
    expect(result.to).toBe(TO);
    expect(result.value).toBe(123n);
  });

  test("combines timestamp + origin (timestamp first, then origin)", () => {
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    const result = addTransactionMetadata(tx, {
      origin: "feed",
      timestamp: true,
    });
    // 0xdeadbeef + 8-char timestamp + "feed"
    expect(result.data.startsWith("0xdeadbeef")).toBe(true);
    expect(result.data.endsWith("feed")).toBe(true);
    // 0xdeadbeef = 10 chars, +8 ts hex chars, +4 origin chars = 22
    expect(result.data.length).toBe(10 + 8 + 4);
  });
});
