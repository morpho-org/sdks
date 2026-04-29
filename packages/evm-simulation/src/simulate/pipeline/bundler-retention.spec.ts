import { getChainAddresses } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { vi } from "vitest";

vi.mock("@morpho-org/blue-sdk", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@morpho-org/blue-sdk")>();
  return { ...mod, getChainAddresses: vi.fn(mod.getChainAddresses) };
});

import { BlacklistViolationError } from "../../errors.js";
import { makeTransferLog } from "../../test-helpers/index.js";
import { parseTransfers } from "../parsing/transfers.js";
import { assertNoBundlerRetention } from "./bundler-retention.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const DAI: Address = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
// Pulled from blue-sdk so tests exercise the real Set membership check.
const BUNDLER = getAddress(getChainAddresses(1).bundler3.bundler3) as Address;

describe("assertNoBundlerRetention", () => {
  it("does not throw for transfers to non-blacklisted addresses", () => {
    const transfers = parseTransfers([
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ]);
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers }),
    ).not.toThrow();
  });

  it("does not throw for dust amounts to blacklisted addresses", () => {
    const transfers = parseTransfers([
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 50n }),
    ]);
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers }),
    ).not.toThrow();
  });

  it("does not throw for empty transfers", () => {
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers: [] }),
    ).not.toThrow();
  });

  it("does not throw for unsupported chain (no blacklist)", () => {
    const transfers = parseTransfers([
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ]);
    expect(() =>
      assertNoBundlerRetention({ chainId: 999999, transfers }),
    ).not.toThrow();
  });

  it("propagates unexpected SDK errors instead of swallowing them", () => {
    vi.mocked(getChainAddresses).mockImplementationOnce(() => {
      throw new Error("unexpected SDK bug");
    });

    const transfers = parseTransfers([
      makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 1000000n }),
    ]);

    expect(() => assertNoBundlerRetention({ chainId: 1, transfers })).toThrow(
      "unexpected SDK bug",
    );
  });

  it("does not throw when bundler passes tokens through (net zero)", () => {
    const transfers = parseTransfers([
      makeTransferLog({
        token: USDC,
        from: USER,
        to: BUNDLER,
        amount: 1000000n,
      }),
      makeTransferLog({
        token: USDC,
        from: BUNDLER,
        to: VAULT,
        amount: 1000000n,
      }),
    ]);
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers }),
    ).not.toThrow();
  });

  it("throws when bundler retains tokens above dust threshold", () => {
    const transfers = parseTransfers([
      makeTransferLog({
        token: USDC,
        from: USER,
        to: BUNDLER,
        amount: 1000000n,
      }),
    ]);
    expect(() => assertNoBundlerRetention({ chainId: 1, transfers })).toThrow(
      BlacklistViolationError,
    );
  });

  it("throws when bundler retains partial amount above dust", () => {
    const transfers = parseTransfers([
      makeTransferLog({
        token: USDC,
        from: USER,
        to: BUNDLER,
        amount: 1000000n,
      }),
      makeTransferLog({
        token: USDC,
        from: BUNDLER,
        to: VAULT,
        amount: 500000n,
      }),
    ]);
    // Net retention: 500000 > DUST_THRESHOLD (100)
    expect(() => assertNoBundlerRetention({ chainId: 1, transfers })).toThrow(
      BlacklistViolationError,
    );
  });

  it("does not throw when bundler retention is below dust threshold", () => {
    const transfers = parseTransfers([
      makeTransferLog({ token: USDC, from: USER, to: BUNDLER, amount: 150n }),
      makeTransferLog({ token: USDC, from: BUNDLER, to: VAULT, amount: 100n }),
    ]);
    // Net retention: 50 <= DUST_THRESHOLD (100)
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers }),
    ).not.toThrow();
  });

  it("throws when bundler is DRAINED (net negative) above dust", () => {
    // Bundler sends more than it receives in this bundle — implies a
    // pre-existing balance is being drawn down. Red flag.
    const transfers = parseTransfers([
      makeTransferLog({
        token: USDC,
        from: BUNDLER,
        to: VAULT,
        amount: 1000000n,
      }),
      // No corresponding inbound — bundler had pre-existing balance.
    ]);
    expect(() => assertNoBundlerRetention({ chainId: 1, transfers })).toThrow(
      BlacklistViolationError,
    );
  });

  it("flags retention per (bundler,token) pair — tokenA retained, tokenB clean", () => {
    const transfers = parseTransfers([
      // USDC retained: 1M in, 0 out
      makeTransferLog({
        token: USDC,
        from: USER,
        to: BUNDLER,
        amount: 1000000n,
      }),
      // DAI clean: 1M in, 1M out (net zero)
      makeTransferLog({
        token: DAI,
        from: USER,
        to: BUNDLER,
        amount: 1000000n,
      }),
      makeTransferLog({
        token: DAI,
        from: BUNDLER,
        to: VAULT,
        amount: 1000000n,
      }),
    ]);

    try {
      assertNoBundlerRetention({ chainId: 1, transfers });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BlacklistViolationError);
      const changes = (err as BlacklistViolationError).assetChanges ?? [];
      // Only USDC retention flagged; DAI is net zero.
      expect(changes).toHaveLength(1);
      expect(changes[0]!.token?.toLowerCase()).toBe(USDC.toLowerCase());
      expect(changes[0]!.netRetained).toBe("1000000");
    }
  });

  it("BlacklistViolationError.assetChanges includes {address, token, netRetained}", () => {
    const transfers = parseTransfers([
      makeTransferLog({ token: USDC, from: USER, to: BUNDLER, amount: 777n }),
    ]);

    try {
      assertNoBundlerRetention({ chainId: 1, transfers });
      expect.fail("should have thrown");
    } catch (err) {
      const changes = (err as BlacklistViolationError).assetChanges ?? [];
      expect(changes).toHaveLength(1);
      const entry = changes[0]!;
      expect(entry.address?.toLowerCase()).toBe(BUNDLER.toLowerCase());
      expect(entry.token?.toLowerCase()).toBe(USDC.toLowerCase());
      expect(entry.netRetained).toBe("777");
    }
  });
});
