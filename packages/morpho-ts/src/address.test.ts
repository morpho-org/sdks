import fc from "fast-check";
import { getAddress } from "viem";
import { describe, expect, test } from "vitest";

import { getChecksumAddress, isAddress, isChecksumAddress } from "./address.js";
import { InvalidAddressError } from "./errors.js";

const EIP55_FIXTURES = [
  "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
  "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
  "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
  "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
] as const;

describe("isAddress", () => {
  test("default", () => {
    expect(isAddress(EIP55_FIXTURES[0])).toBe(true);
    expect(isAddress(EIP55_FIXTURES[0].toLowerCase())).toBe(true);
  });

  test.each(["0x12", "abc", "0x" + "a".repeat(39), "0x" + "g".repeat(40), ""])(
    "behavior: rejects %s",
    (value) => {
      expect(isAddress(value)).toBe(false);
    },
  );
});

describe("getChecksumAddress", () => {
  test.each(EIP55_FIXTURES)("default: %s", (address) => {
    expect(getChecksumAddress(address)).toBe(address);
  });

  test.each(EIP55_FIXTURES)(
    "behavior: lowercases to checksum %s",
    (address) => {
      expect(getChecksumAddress(address.toLowerCase())).toBe(address);
    },
  );

  test.each(EIP55_FIXTURES)(
    "behavior: uppercases to checksum %s",
    (address) => {
      expect(getChecksumAddress(`0x${address.slice(2).toUpperCase()}`)).toBe(
        address,
      );
    },
  );

  test("behavior: idempotent on canonical input", () => {
    for (const address of EIP55_FIXTURES)
      expect(getChecksumAddress(getChecksumAddress(address))).toBe(address);
  });

  test("error: InvalidAddressError on bad mixed-case checksum", () => {
    const bad = `0x${"5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed".replace("A", "a")}`;

    expect(() => getChecksumAddress(bad)).toThrow(InvalidAddressError);
  });

  test.each(["0x12", "abc", "0x" + "a".repeat(39), "0x" + "g".repeat(40)])(
    "error: InvalidAddressError on %s",
    (value) => {
      expect(() => getChecksumAddress(value)).toThrow(InvalidAddressError);
    },
  );

  test("behavior: matches viem getAddress for lowercase input", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(..."0123456789abcdef".split("")), {
            minLength: 40,
            maxLength: 40,
          })
          .map((chars) => chars.join("")),
        (hex) => {
          const lower = `0x${hex.toLowerCase()}`;

          expect(getChecksumAddress(lower)).toBe(getAddress(lower));
          expect(getChecksumAddress(getChecksumAddress(lower))).toBe(
            getChecksumAddress(lower),
          );
        },
      ),
    );
  });
});

describe("isChecksumAddress", () => {
  test.each(EIP55_FIXTURES)("default: %s", (address) => {
    expect(isChecksumAddress(address)).toBe(true);
  });

  test.each(EIP55_FIXTURES)("behavior: rejects lowercase %s", (address) => {
    expect(isChecksumAddress(address.toLowerCase())).toBe(false);
  });

  test("behavior: rejects malformed and mis-checksummed inputs", () => {
    const misChecksummed = `0x${"D1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb".replace("D", "d")}`;

    expect(isChecksumAddress("0x12")).toBe(false);
    expect(isChecksumAddress(misChecksummed)).toBe(false);
  });
});
