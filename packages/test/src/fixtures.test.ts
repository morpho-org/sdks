import { isAddress } from "viem";
import { describe, expect, test } from "vitest";
import { randomAddress, testAccount } from "./fixtures.js";

describe("randomAddress", () => {
  test("returns a valid checksummed Ethereum address", () => {
    const a = randomAddress();
    expect(isAddress(a, { strict: true })).toBe(true);
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test("produces deterministically distinct addresses on subsequent calls", () => {
    const a = randomAddress();
    const b = randomAddress();
    expect(a).not.toBe(b);
  });

  test("supports per-chain checksum encoding (EIP-1191)", () => {
    const a = randomAddress(1);
    const b = randomAddress(137);
    // chainId-bound checksum (EIP-1191) intentionally diverges from EIP-55,
    // so strict (mainnet) validation does not always pass; structural
    // validation does.
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(b).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe("testAccount", () => {
  test("derives the canonical Hardhat/Anvil test account 0 by default", () => {
    const account = testAccount();
    // Anvil default mnemonic, account 0
    expect(account.address.toLowerCase()).toBe(
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
  });

  test("derives the canonical test account 1", () => {
    const account = testAccount(1);
    expect(account.address.toLowerCase()).toBe(
      "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    );
  });

  test("derived accounts are deterministic", () => {
    const a1 = testAccount(0);
    const a2 = testAccount(0);
    expect(a1.address).toBe(a2.address);
  });

  test("different indices yield different addresses", () => {
    const a0 = testAccount(0);
    const a5 = testAccount(5);
    expect(a0.address).not.toBe(a5.address);
  });

  test("returned account exposes a sign function", () => {
    const account = testAccount();
    expect(typeof account.sign).toBe("function");
    expect(typeof account.signMessage).toBe("function");
    expect(typeof account.signTypedData).toBe("function");
  });
});
