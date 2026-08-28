import { addressesRegistry, getChainAddresses } from "@morpho-org/blue-sdk";
import { type Address, ethAddress, getAddress } from "viem";
import { vi } from "vitest";

// Overrides are keyed by chainId rather than queued as `mockReturnValueOnce`,
// because these cases run concurrently: a call-ordered one-shot would be
// consumed by whichever sibling case happens to reach getChainAddresses first.
// Each case below owns a dedicated chainId, so nothing is shared between them.
const { chainAddressOverrides } = vi.hoisted(() => ({
  chainAddressOverrides: new Map<
    number,
    () => ReturnType<typeof getChainAddresses>
  >(),
}));

vi.mock("@morpho-org/blue-sdk", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@morpho-org/blue-sdk")>();
  return {
    ...mod,
    getChainAddresses: vi.fn((chainId: number) => {
      const override = chainAddressOverrides.get(chainId);
      return override ? override() : mod.getChainAddresses(chainId);
    }),
  };
});

import { BlacklistViolationError } from "../../errors.js";
import { makeCall, makeTransferLog } from "../../test-helpers/index.js";
import { parseTransfers } from "../parsing/transfers.js";
import { assertNoBundlerRetention } from "./bundler-retention.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const DAI: Address = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
// Pulled from blue-sdk so tests exercise the real Set membership check.
const BUNDLER = getAddress(getChainAddresses(1).bundler3.bundler3) as Address;

// Synthetic chainIds owned by exactly one case each — see chainAddressOverrides.
const NO_BUNDLER_CHAIN_ID = 1_000_001;
const SDK_ERROR_CHAIN_ID = 1_000_002;

chainAddressOverrides.set(NO_BUNDLER_CHAIN_ID, () => ({
  ...addressesRegistry[1],
  bundler3: undefined as never,
}));
chainAddressOverrides.set(SDK_ERROR_CHAIN_ID, () => {
  throw new Error("unexpected SDK bug");
});

describe("assertNoBundlerRetention", () => {
  it("does not throw for transfers to non-blacklisted addresses", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: VAULT,
          amount: 1000000n,
        }),
      ]),
    ]);
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).not.toThrow();
  });

  it("does not throw for dust amounts to blacklisted addresses", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 50n }),
      ]),
    ]);
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).not.toThrow();
  });

  it("does not throw for empty transfers", () => {
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers: [], assetChanges: [] }),
    ).not.toThrow();
  });

  it("does not throw for unsupported chain (no blacklist)", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: VAULT,
          amount: 1000000n,
        }),
      ]),
    ]);
    expect(() =>
      assertNoBundlerRetention({
        chainId: 999999,
        transfers,
        assetChanges: [],
      }),
    ).not.toThrow();
  });

  it("warns and skips when blue-sdk knows the chain but has no bundler3 config", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    expect(() =>
      assertNoBundlerRetention({
        chainId: NO_BUNDLER_CHAIN_ID,
        transfers: [],
        assetChanges: [],
        logger,
      }),
    ).not.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      "Chain known to blue-sdk but has no bundler3 config, retention check skipped",
      { chainId: NO_BUNDLER_CHAIN_ID },
    );
  });

  it("propagates unexpected SDK errors instead of swallowing them", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: VAULT,
          amount: 1000000n,
        }),
      ]),
    ]);

    expect(() =>
      assertNoBundlerRetention({
        chainId: SDK_ERROR_CHAIN_ID,
        transfers,
        assetChanges: [],
      }),
    ).toThrow("unexpected SDK bug");
  });

  it("does not throw when bundler passes tokens through (net zero)", () => {
    const transfers = parseTransfers([
      makeCall([
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
      ]),
    ]);
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).not.toThrow();
  });

  it("throws when bundler retains tokens above dust threshold", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: BUNDLER,
          amount: 1000000n,
        }),
      ]),
    ]);
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).toThrow(BlacklistViolationError);
  });

  it("throws when bundler retains partial amount above dust", () => {
    const transfers = parseTransfers([
      makeCall([
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
      ]),
    ]);
    // Net retention: 500000 > DUST_THRESHOLD (100)
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).toThrow(BlacklistViolationError);
  });

  it("does not throw when bundler retention is below dust threshold", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({ token: USDC, from: USER, to: BUNDLER, amount: 150n }),
        makeTransferLog({
          token: USDC,
          from: BUNDLER,
          to: VAULT,
          amount: 100n,
        }),
      ]),
    ]);
    // Net retention: 50 <= DUST_THRESHOLD (100)
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).not.toThrow();
  });

  it("warns instead of throwing when bundler is swept (net negative) above dust", () => {
    // Bundler sends more than it receives in this bundle — a pre-existing
    // balance is being drawn down, not retained by the current bundle.
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: BUNDLER,
          to: VAULT,
          amount: 1000000n,
        }),
        // No corresponding inbound — bundler had pre-existing balance.
      ]),
    ]);

    expect(() =>
      assertNoBundlerRetention({
        chainId: 1,
        transfers,
        assetChanges: [],
        logger,
      }),
    ).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      "Simulation detected pre-existing bundler balance being swept",
      {
        changes: [
          {
            address: BUNDLER,
            token: USDC,
            netSwept: "1000000",
          },
        ],
      },
    );
  });

  it("flags retention per (bundler,token) pair — tokenA retained, tokenB clean", () => {
    const transfers = parseTransfers([
      makeCall([
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
      ]),
    ]);

    try {
      assertNoBundlerRetention({ chainId: 1, transfers, assetChanges: [] });
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
      makeCall([
        makeTransferLog({ token: USDC, from: USER, to: BUNDLER, amount: 777n }),
      ]),
    ]);

    try {
      assertNoBundlerRetention({ chainId: 1, transfers, assetChanges: [] });
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

  // ─── Native ETH ──────────────────────────────────────────────────────────
  // Native ETH emits no event log, so it never reaches `transfers` on the
  // Tenderly primary backend — it must be read from `assetChanges`. Regression
  // suite for Cantina finding 1440 (native ETH retained by bundler3 silently
  // passing the guard).
  const ONE_ETH = 1_000000000000000000n;

  it("behavior: throws when bundler retains native ETH reported only in assetChanges (Tenderly path)", () => {
    // Tenderly derives native ETH into assetChanges and emits no transfer log.
    // Before the fix this resolved instead of throwing (finding 1440).
    expect(() =>
      assertNoBundlerRetention({
        chainId: 1,
        transfers: [],
        assetChanges: [
          { account: BUNDLER, changes: [{ token: ethAddress, diff: ONE_ETH }] },
        ],
      }),
    ).toThrow(BlacklistViolationError);
  });

  it("behavior: counts native ETH once when present in both a transfer log and assetChanges (eth_simulateV1 path)", () => {
    // eth_simulateV1 synthesizes native moves as `ethAddress` transfer logs and
    // derives assetChanges from them. The guard must not sum both sources.
    const transfers = [
      { token: ethAddress, from: USER, to: BUNDLER, amount: ONE_ETH, txIdx: 0 },
    ];
    try {
      assertNoBundlerRetention({
        chainId: 1,
        transfers,
        assetChanges: [
          { account: BUNDLER, changes: [{ token: ethAddress, diff: ONE_ETH }] },
        ],
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BlacklistViolationError);
      const changes = (err as BlacklistViolationError).assetChanges ?? [];
      expect(changes).toHaveLength(1);
      expect(changes[0]!.token?.toLowerCase()).toBe(ethAddress.toLowerCase());
      // Counted once (assetChanges), not doubled with the synthetic log.
      expect(changes[0]!.netRetained).toBe(ONE_ETH.toString());
    }
  });

  it("behavior: falls back to native transfer logs when assetChanges has no native entry", () => {
    // Defense in depth: a backend that populates native transfers but not
    // assetChanges must still trip the guard.
    const transfers = [
      { token: ethAddress, from: USER, to: BUNDLER, amount: ONE_ETH, txIdx: 0 },
    ];
    expect(() =>
      assertNoBundlerRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).toThrow(BlacklistViolationError);
  });

  it("behavior: does not throw when native ETH passes through the bundler (net zero)", () => {
    expect(() =>
      assertNoBundlerRetention({
        chainId: 1,
        transfers: [],
        assetChanges: [
          { account: BUNDLER, changes: [{ token: ethAddress, diff: 0n }] },
        ],
      }),
    ).not.toThrow();
  });

  it("behavior: does not throw for native ETH retention below dust threshold", () => {
    expect(() =>
      assertNoBundlerRetention({
        chainId: 1,
        transfers: [],
        assetChanges: [
          { account: BUNDLER, changes: [{ token: ethAddress, diff: 50n }] },
        ],
      }),
    ).not.toThrow();
  });

  it("behavior: ignores native ETH assetChanges for non-bundler accounts", () => {
    expect(() =>
      assertNoBundlerRetention({
        chainId: 1,
        transfers: [],
        assetChanges: [
          { account: VAULT, changes: [{ token: ethAddress, diff: ONE_ETH }] },
        ],
      }),
    ).not.toThrow();
  });

  it("behavior: reports both ERC20 (from logs) and native ETH (from assetChanges) retention together", () => {
    // Mixed bundle: WETH stuck via a log, native ETH stuck via assetChanges.
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: BUNDLER,
          amount: 1000000n,
        }),
      ]),
    ]);
    try {
      assertNoBundlerRetention({
        chainId: 1,
        transfers,
        assetChanges: [
          { account: BUNDLER, changes: [{ token: ethAddress, diff: ONE_ETH }] },
        ],
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BlacklistViolationError);
      const changes = (err as BlacklistViolationError).assetChanges ?? [];
      const tokens = changes.map((c) => c.token?.toLowerCase()).sort();
      expect(tokens).toEqual(
        [USDC.toLowerCase(), ethAddress.toLowerCase()].sort(),
      );
    }
  });
});
