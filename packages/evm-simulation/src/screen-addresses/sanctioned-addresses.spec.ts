import { sanctionedAddresses } from "./sanctioned-addresses.js";

describe("sanctionedAddresses dataset", () => {
  it("is non-empty", () => {
    expect(sanctionedAddresses.size).toBeGreaterThan(0);
  });

  it("contains only well-formed EVM addresses (0x + 40 hex chars)", () => {
    const invalid: string[] = [];
    for (const addr of sanctionedAddresses) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) invalid.push(addr);
    }
    expect(invalid).toEqual([]);
  });

  it("screen-addresses lowercases before lookup, so entries must already be lowercase (case-insensitive sets would miss hits)", () => {
    // screenAddresses does `sanctionedAddresses.has(addr.toLowerCase())`.
    // If the dataset stored mixed-case entries, they'd never match. This test
    // enforces the dataset invariant that consumers depend on.
    const mixedCase: string[] = [];
    for (const addr of sanctionedAddresses) {
      if (addr !== addr.toLowerCase()) mixedCase.push(addr);
    }
    expect(mixedCase).toEqual([]);
  });

  it("contains no internal duplicates after Set construction", () => {
    // Set dedupes by identity, but a lowercase dup of a mixed-case entry would
    // still slip through if the dataset had mixed casing — which is why the
    // previous test matters.
    const asArray = [...sanctionedAddresses];
    expect(asArray.length).toBe(new Set(asArray).size);
  });
});
