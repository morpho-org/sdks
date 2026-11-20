import type { Address, Hex } from "viem";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InputExceedsMaxError, NegativeInputError } from "../types/error.js";
import {
  addTransactionMetadata,
  resolveTransactionMetadata,
} from "./metadata.js";

const TO: Address = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";

describe("resolveTransactionMetadata", () => {
  test.each([-1n, 1n << 32n])(
    "rejects out-of-range timestamp %s",
    (timestamp) => {
      const error =
        timestamp < 0n
          ? new NegativeInputError("metadata.timestamp", timestamp)
          : new InputExceedsMaxError({
              field: "metadata.timestamp",
              value: timestamp,
              max: (1n << 32n) - 1n,
            });
      expect(() =>
        resolveTransactionMetadata({ origin: "cafe", timestamp }),
      ).toThrowError(
        timestamp < 0n ? NegativeInputError : InputExceedsMaxError,
      );
      expect(() =>
        resolveTransactionMetadata({ origin: "cafe", timestamp }),
      ).toThrowError(error);
      expect(() =>
        resolveTransactionMetadata(
          { origin: "cafe", timestamp: true },
          timestamp,
        ),
      ).toThrowError(error);
    },
  );

  test("accepts the uint32 upper boundary", () => {
    const timestamp = (1n << 32n) - 1n;
    const metadata = { origin: "cafe", timestamp };
    expect(resolveTransactionMetadata(metadata)).toBe(metadata);
    expect(
      resolveTransactionMetadata(
        { origin: "cafe", timestamp: true },
        timestamp,
      ),
    ).toEqual(metadata);
  });
  test.each([0n, 1_800_000_000n])(
    "uses reference time %s without mutating metadata",
    (now) => {
      const metadata = Object.freeze({ origin: "cafe", timestamp: true });
      expect(resolveTransactionMetadata(metadata, now)).toEqual({
        origin: "cafe",
        timestamp: now,
      });
      expect(metadata.timestamp).toBe(true);
    },
  );

  test("preserves missing metadata", () => {
    expect(resolveTransactionMetadata(undefined, 1n)).toBeUndefined();
  });

  test("preserves the device-clock option when reference time is omitted", () => {
    const metadata = { origin: "cafe", timestamp: true };
    expect(resolveTransactionMetadata(metadata)).toBe(metadata);
  });

  test.each([undefined, false, 0n, 1_800_000_000n])(
    "preserves timestamp option %s",
    (timestamp) => {
      const metadata = { origin: "cafe", timestamp };
      expect(resolveTransactionMetadata(metadata, 2n)).toBe(metadata);
    },
  );
});

// `describe.sequential` is required because three tests below install
// `vi.spyOn(console, "warn", …)` and rely on the per-test local `warn`
// reference. Under the repo-wide `sequence: { concurrent: true }`,
// `console.warn` is a single Node global — the last-installed spy wins,
// and `vi.restoreAllMocks()` in one test's afterEach can restore warn
// while another concurrent test is mid-assertion. Serializing the file
// eliminates the race.
describe.sequential("addTransactionMetadata", () => {
  test.each([-1n, 1n << 32n])(
    "rejects out-of-range timestamp %s even for empty calldata",
    (timestamp) => {
      const error =
        timestamp < 0n
          ? new NegativeInputError("metadata.timestamp", timestamp)
          : new InputExceedsMaxError({
              field: "metadata.timestamp",
              value: timestamp,
              max: (1n << 32n) - 1n,
            });
      for (const data of ["0x", "0x1234"] as const) {
        expect(() =>
          addTransactionMetadata(
            { to: TO, value: 0n, data },
            { origin: "cafe", timestamp },
          ),
        ).toThrowError(
          timestamp < 0n ? NegativeInputError : InputExceedsMaxError,
        );
        expect(() =>
          addTransactionMetadata(
            { to: TO, value: 0n, data },
            { origin: "cafe", timestamp },
          ),
        ).toThrowError(error);
      }
    },
  );
  test.each([0n, 1_800_000_000n, (1n << 32n) - 1n])(
    "appends explicit timestamp %s without reading the clock",
    (timestamp) => {
      const clock = vi.spyOn(Date, "now").mockImplementation(() => {
        throw new Error("device clock read");
      });
      try {
        const tx = { to: TO, value: 0n, data: "0x1234" as Hex };
        expect(
          addTransactionMetadata(tx, { origin: "cafe", timestamp }).data,
        ).toBe(`0x1234${timestamp.toString(16).padStart(8, "0")}cafe`);
      } finally {
        clock.mockRestore();
      }
    },
  );
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns the tx unchanged when data is empty", () => {
    const tx = {
      to: TO,
      value: 0n,
      data: "" as Hex,
    };
    expect(addTransactionMetadata(tx, { origin: "" })).toBe(tx);
  });

  test('returns the tx unchanged when data is canonical empty calldata ("0x")', () => {
    const tx = {
      to: TO,
      value: 1n,
      data: "0x" as Hex,
    };
    expect(
      addTransactionMetadata(tx, { origin: "cafe", timestamp: true }),
    ).toBe(tx);
  });

  test("treats metadata.timestamp = false the same as omitted", () => {
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    const explicit = addTransactionMetadata(tx, {
      origin: "",
      timestamp: false,
    });
    const omitted = addTransactionMetadata(tx, { origin: "" });
    expect(explicit.data).toBe(omitted.data);
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

  test("strips a 0x prefix from origin and appends the raw hex", () => {
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    const result = addTransactionMetadata(tx, { origin: "0xcafe" });
    // Source now strips leading 0x; final calldata = data + cafe.
    expect(result.data).toBe("0xdeadbeefcafe");
  });

  test("strips an uppercase 0X prefix from origin (case-insensitive)", () => {
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    // "0Xcafe" must produce the same calldata as "0xcafe" / "cafe".
    expect(addTransactionMetadata(tx, { origin: "0Xcafe" }).data).toBe(
      "0xdeadbeefcafe",
    );
  });

  test("warns and skips odd-length raw origin (would corrupt trailing byte)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    // "abc" is 3 hex chars — non-byte-aligned. viem's concatHex would
    // pad the stray nibble at broadcast, corrupting the trailing analytics
    // byte; the helper rejects it instead.
    const result = addTransactionMetadata(tx, { origin: "abc" });
    expect(result.data).toBe("0xdeadbeef");
    expect(warn).toHaveBeenCalled();
  });

  test("warns and skips odd-length origin with a 0x prefix", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    // After stripping "0x", the remaining "abc" is 3 hex chars — odd.
    const result = addTransactionMetadata(tx, { origin: "0xabc" });
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

  test("warns and skips origin longer than 8 hex chars (raw)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    // 10 hex chars without 0x prefix — exercises the explicit length check
    // (origin.length > 8) AFTER the 0x-strip and isHex pass.
    const result = addTransactionMetadata(tx, {
      origin: "deadbeef00",
    });
    expect(result.data).toBe("0xdeadbeef");
    expect(warn).toHaveBeenCalled();
  });

  test("warns and skips origin longer than 8 hex chars (with 0x prefix)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tx = { to: TO, value: 0n, data: "0xdeadbeef" as Hex };
    // After stripping "0x", the remaining "deadbeef00" is 10 chars.
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
