import { describe, expect, test } from "vitest";
import {
  getMidnightAddresses,
  midnightAddressRegistry,
  UnsupportedMidnightChainError,
} from "./index.js";

describe("getMidnightAddresses", () => {
  test("error: UnsupportedMidnightChainError", () => {
    expect(() => getMidnightAddresses(1)).toThrow(
      UnsupportedMidnightChainError,
    );
  });
});

describe("midnightAddressRegistry", () => {
  test("default", () => {
    expect(midnightAddressRegistry.size).toBe(0);
  });
});
