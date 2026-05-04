import { describe, expect, test } from "vitest";
import type { Address } from "../types.js";
import { VaultUser } from "./VaultUser.js";

const VAULT: Address = "0x1111111111111111111111111111111111111111";
const USER: Address = "0x2222222222222222222222222222222222222222";

describe("VaultUser", () => {
  test("stores all fields", () => {
    const u = new VaultUser({
      vault: VAULT,
      user: USER,
      isAllocator: true,
      allowance: 100n,
    });
    expect(u.vault).toBe(VAULT);
    expect(u.user).toBe(USER);
    expect(u.isAllocator).toBe(true);
    expect(u.allowance).toBe(100n);
  });

  test("isAllocator and allowance can be reassigned (mutable)", () => {
    const u = new VaultUser({
      vault: VAULT,
      user: USER,
      isAllocator: false,
      allowance: 0n,
    });
    u.isAllocator = true;
    u.allowance = 999n;
    expect(u.isAllocator).toBe(true);
    expect(u.allowance).toBe(999n);
  });
});
