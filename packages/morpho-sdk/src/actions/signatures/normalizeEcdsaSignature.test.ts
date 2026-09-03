import fc from "fast-check";
import {
  concatHex,
  type Hex,
  serializeCompactSignature,
  serializeSignature,
  signatureToCompactSignature,
} from "viem";
import { describe, expect, test } from "vitest";
import { normalizeEcdsaSignature } from "./normalizeEcdsaSignature.js";

class TestMismatchError extends Error {
  public constructor(
    public readonly expected: string,
    options?: { cause?: unknown },
  ) {
    super(expected, options);
    this.name = "TestMismatchError";
  }
}

const onInvalid = ({
  expected,
  cause,
}: {
  readonly expected: string;
  readonly cause?: unknown;
}) => new TestMismatchError(expected, { cause });

const r = `0x${"11".repeat(32)}` as const;
const s = `0x${"22".repeat(32)}` as const;

describe("normalizeEcdsaSignature", () => {
  test("default", () => {
    expect(
      normalizeEcdsaSignature(
        serializeSignature({ r, s, yParity: 1 }),
        onInvalid,
      ),
    ).toEqual({ v: 28, r, s });
  });

  test("behavior: accepts a 64-byte EIP-2098 compact signature", () => {
    expect(
      normalizeEcdsaSignature(
        serializeCompactSignature(
          signatureToCompactSignature({ r, s, yParity: 1 }),
        ),
        onInvalid,
      ),
    ).toEqual({ v: 28, r, s });
  });

  test("behavior: widens yParity to v when the encoding carries no v", () => {
    // A 65-byte signature whose last byte is `0x00`/`0x01` parses to `yParity` with no `v`.
    expect(
      normalizeEcdsaSignature(concatHex([r, s, "0x00"]), onInvalid),
    ).toEqual({ v: 27, r, s });
    expect(
      normalizeEcdsaSignature(concatHex([r, s, "0x01"]), onInvalid),
    ).toEqual({ v: 28, r, s });
  });

  test("behavior: 65-byte and compact encodings of one signature normalize identically", () => {
    const toHex = (bytes: Uint8Array) =>
      `0x${Buffer.from(bytes).toString("hex")}` as Hex;
    fc.assert(
      fc.property(
        fc.record({
          rBytes: fc.uint8Array({ minLength: 32, maxLength: 32 }),
          sBytes: fc.uint8Array({ minLength: 32, maxLength: 32 }),
          yParity: fc.constantFrom(0 as const, 1 as const),
        }),
        ({ rBytes, sBytes, yParity }) => {
          // Compact packing folds yParity into the top bit of `s`, so it needs `s < 2^255`.
          const signature = {
            r: toHex(rBytes),
            s: toHex(Uint8Array.from([sBytes[0]! & 0x7f, ...sBytes.slice(1)])),
            yParity,
          };
          expect(
            normalizeEcdsaSignature(serializeSignature(signature), onInvalid),
          ).toEqual(
            normalizeEcdsaSignature(
              serializeCompactSignature(signatureToCompactSignature(signature)),
              onInvalid,
            ),
          );
        },
      ),
    );
  });

  test("error: undecodable signature is raised through onInvalid with the cause", () => {
    // 63 bytes: neither the compact nor the serialized length viem accepts.
    const malformed = `0x${"ab".repeat(63)}` as const;
    const error = (() => {
      try {
        normalizeEcdsaSignature(malformed, onInvalid);
      } catch (thrown) {
        return thrown;
      }
    })();
    expect(error).toBeInstanceOf(TestMismatchError);
    expect((error as TestMismatchError).expected).toBe(
      "a 64-byte compact or 65-byte serialized ECDSA signature",
    );
    expect((error as TestMismatchError).cause).toBeDefined();
  });

  test("error: trailing byte outside the recovery-id set is rejected", () => {
    // viem rejects a v byte outside {0, 1, 27, 28} while parsing, so this lands on the same
    // undecodable branch rather than the `v`/`yParity` guard — which only exists because viem's
    // `Signature` union leaves both fields optional, and is unreachable through these parsers.
    expect(() =>
      normalizeEcdsaSignature(concatHex([r, s, "0x05"]), onInvalid),
    ).toThrow(TestMismatchError);
  });
});
