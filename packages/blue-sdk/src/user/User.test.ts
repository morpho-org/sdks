import { describe, expect, test } from "vitest";
import type { Address } from "../types.js";
import { User } from "./User.js";

const ADDR: Address = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";

describe("User", () => {
  test("stores all fields", () => {
    const u = new User({
      address: ADDR,
      isBundlerAuthorized: true,
      morphoNonce: 5n,
    });
    expect(u.address).toBe(ADDR);
    expect(u.isBundlerAuthorized).toBe(true);
    expect(u.morphoNonce).toBe(5n);
  });
});
