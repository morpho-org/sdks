import { addressesRegistry, getChainAddresses } from "@morpho-org/blue-sdk";
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  ethAddress,
  getAddress,
  zeroAddress,
} from "viem";
import { describe, vi } from "vitest";

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
import { parseTransfers as parseRawTransfers } from "../parsing/transfers.js";
import {
  assertNoBundlesRetention,
  checkBundlesRetention,
  planBundlesRetentionReads,
} from "./bundles-retention.js";

const parseTransfers = (calls: Parameters<typeof parseRawTransfers>[0]) =>
  parseRawTransfers(calls, { chainId: 1 }).transfers;

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const DAI: Address = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
// Pulled from blue-sdk so tests exercise the real Set membership check.
const bundles = getChainAddresses(1).bundles!;
const BUNDLES_TARGET = getAddress(bundles.vaultBundlesV1!) as Address;
const BLUE_BUNDLES = getAddress(bundles.blueBundlesV1!) as Address;
const VAULT_EXIT_BUNDLES = getAddress(bundles.vaultExitBundlesV1) as Address;
const MIDNIGHT_BUNDLES: Address = "0x3333333333333333333333333333333333333333";

// Synthetic chainIds owned by exactly one case each — see chainAddressOverrides.
const NO_BUNDLES_CHAIN_ID = 1_000_001;
const SDK_ERROR_CHAIN_ID = 1_000_002;
const ONLY_MIDNIGHT_CHAIN_ID = 1_000_003;
const BUNDLES_AND_MIDNIGHT_CHAIN_ID = 1_000_004;

// Neither bundles nor midnightBundlesV2 cataloged — retention check fully skipped.
chainAddressOverrides.set(NO_BUNDLES_CHAIN_ID, () => ({
  ...addressesRegistry[1],
  bundles: undefined,
  midnightBundlesV2: undefined,
}));
// Only midnightBundlesV2 present — the check still guards `MidnightBundlesV2`.
chainAddressOverrides.set(ONLY_MIDNIGHT_CHAIN_ID, () => ({
  ...addressesRegistry[1],
  bundles: undefined,
  midnightBundlesV2: MIDNIGHT_BUNDLES,
}));
// Both bundles and midnightBundlesV2 present — both are guarded.
chainAddressOverrides.set(BUNDLES_AND_MIDNIGHT_CHAIN_ID, () => ({
  ...addressesRegistry[1],
  midnightBundlesV2: MIDNIGHT_BUNDLES,
}));
chainAddressOverrides.set(SDK_ERROR_CHAIN_ID, () => {
  throw new Error("unexpected SDK bug");
});

describe("assertNoBundlesRetention", () => {
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
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).not.toThrow();
  });

  it("does not throw for dust amounts to blacklisted addresses", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({ token: USDC, from: USER, to: VAULT, amount: 50n }),
      ]),
    ]);
    expect(() =>
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).not.toThrow();
  });

  it("does not throw for empty transfers", () => {
    expect(() =>
      assertNoBundlesRetention({ chainId: 1, transfers: [], assetChanges: [] }),
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
      assertNoBundlesRetention({
        chainId: 999999,
        transfers,
        assetChanges: [],
      }),
    ).not.toThrow();
  });

  it("warns and skips when blue-sdk knows the chain but has no restricted intermediary config", () => {
    const result = checkBundlesRetention({
      chainId: NO_BUNDLES_CHAIN_ID,
      transfers: [],
      assetChanges: [],
    });
    expect(result).toMatchObject({
      status: "skipped-unsupported-chain",
      failures: [],
      warnings: [
        {
          code: "RETENTION_CHECK_SKIPPED",
          severity: "warn",
          chainId: NO_BUNDLES_CHAIN_ID,
          reason: "missing-restricted-addresses",
        },
      ],
    });
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
      assertNoBundlesRetention({
        chainId: SDK_ERROR_CHAIN_ID,
        transfers,
        assetChanges: [],
      }),
    ).toThrow("unexpected SDK bug");
  });

  it("does not throw when bundles contract passes tokens through (net zero)", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: BUNDLES_TARGET,
          amount: 1000000n,
        }),
        makeTransferLog({
          token: USDC,
          from: BUNDLES_TARGET,
          to: VAULT,
          amount: 1000000n,
        }),
      ]),
    ]);
    expect(() =>
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).not.toThrow();
  });

  it("throws when bundles contract retains tokens above dust threshold", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: BUNDLES_TARGET,
          amount: 1000000n,
        }),
      ]),
    ]);
    expect(() =>
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).toThrow(BlacklistViolationError);
  });

  it("throws when bundles contract retains partial amount above dust", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: BUNDLES_TARGET,
          amount: 1000000n,
        }),
        makeTransferLog({
          token: USDC,
          from: BUNDLES_TARGET,
          to: VAULT,
          amount: 500000n,
        }),
      ]),
    ]);
    // Net retention: 500000 > DUST_THRESHOLD (100)
    expect(() =>
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).toThrow(BlacklistViolationError);
  });

  it("does not throw when bundles contract retention is below dust threshold", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: BUNDLES_TARGET,
          amount: 150n,
        }),
        makeTransferLog({
          token: USDC,
          from: BUNDLES_TARGET,
          to: VAULT,
          amount: 100n,
        }),
      ]),
    ]);
    // Net retention: 50 <= DUST_THRESHOLD (100)
    expect(() =>
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).not.toThrow();
  });

  it("warns instead of throwing when bundles contract is swept (net negative) above dust", () => {
    // Bundles contract sends more than it receives in this bundle — a pre-existing
    // balance is being drawn down, not retained by the current bundle.
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: BUNDLES_TARGET,
          to: VAULT,
          amount: 1000000n,
        }),
        // No corresponding inbound — bundles contract had pre-existing balance.
      ]),
    ]);

    const result = checkBundlesRetention({
      chainId: 1,
      transfers,
      assetChanges: [],
    });
    expect(result).toMatchObject({
      status: "checked",
      failures: [],
      warnings: [
        {
          code: "BUNDLES_BALANCE_SWEPT",
          severity: "warn",
          chainId: 1,
          address: BUNDLES_TARGET,
          token: USDC,
          netSwept: 1000000n,
        },
      ],
    });
  });

  it("flags retention per (bundles contract,token) pair — tokenA retained, tokenB clean", () => {
    const transfers = parseTransfers([
      makeCall([
        // USDC retained: 1M in, 0 out
        makeTransferLog({
          token: USDC,
          from: USER,
          to: BUNDLES_TARGET,
          amount: 1000000n,
        }),
        // DAI clean: 1M in, 1M out (net zero)
        makeTransferLog({
          token: DAI,
          from: USER,
          to: BUNDLES_TARGET,
          amount: 1000000n,
        }),
        makeTransferLog({
          token: DAI,
          from: BUNDLES_TARGET,
          to: VAULT,
          amount: 1000000n,
        }),
      ]),
    ]);

    try {
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BlacklistViolationError);
      const changes = (err as BlacklistViolationError).assetChanges ?? [];
      // Only USDC retention flagged; DAI is net zero.
      expect(changes).toHaveLength(1);
      expect(changes[0]!.token?.toLowerCase()).toBe(USDC.toLowerCase());
      expect(changes[0]!.netRetained).toBe(1000000n);
    }
  });

  it("BlacklistViolationError.assetChanges includes {address, token, netRetained}", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: BUNDLES_TARGET,
          amount: 777n,
        }),
      ]),
    ]);

    try {
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] });
      expect.fail("should have thrown");
    } catch (err) {
      const changes = (err as BlacklistViolationError).assetChanges ?? [];
      expect(changes).toHaveLength(1);
      const entry = changes[0]!;
      expect(entry.address?.toLowerCase()).toBe(BUNDLES_TARGET.toLowerCase());
      expect(entry.token?.toLowerCase()).toBe(USDC.toLowerCase());
      expect(entry.netRetained).toBe(777n);
    }
  });

  // ─── Bundles periphery ─────────────────────────────────────────────────────
  // The standalone `bundles` contracts (VaultExitBundlesV1, VaultBundlesV1,
  // BlueBundlesV1) route user value and must not retain it above dust.

  it("behavior: throws when BlueBundlesV1 retains tokens above dust threshold", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: BLUE_BUNDLES,
          amount: 1000000n,
        }),
      ]),
    ]);
    expect(() =>
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).toThrow(BlacklistViolationError);
  });

  it("behavior: throws when VaultExitBundlesV1 retains tokens above dust threshold", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: DAI,
          from: USER,
          to: VAULT_EXIT_BUNDLES,
          amount: 1000000n,
        }),
      ]),
    ]);
    expect(() =>
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).toThrow(BlacklistViolationError);
  });

  it("behavior: does not throw when a bundles contract passes tokens through (net zero)", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: BLUE_BUNDLES,
          amount: 1000000n,
        }),
        makeTransferLog({
          token: USDC,
          from: BLUE_BUNDLES,
          to: VAULT,
          amount: 1000000n,
        }),
      ]),
    ]);
    expect(() =>
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).not.toThrow();
  });

  it("behavior: throws when MidnightBundlesV2 retains tokens above dust threshold", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: MIDNIGHT_BUNDLES,
          amount: 1000000n,
        }),
      ]),
    ]);
    expect(() =>
      assertNoBundlesRetention({
        chainId: BUNDLES_AND_MIDNIGHT_CHAIN_ID,
        transfers,
        assetChanges: [],
      }),
    ).toThrow(BlacklistViolationError);
  });

  it("behavior: guards MidnightBundlesV2 even when the chain has no bundles config", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: MIDNIGHT_BUNDLES,
          amount: 1000000n,
        }),
      ]),
    ]);
    expect(() =>
      assertNoBundlesRetention({
        chainId: ONLY_MIDNIGHT_CHAIN_ID,
        transfers,
        assetChanges: [],
      }),
    ).toThrow(BlacklistViolationError);
  });

  // ─── Native ETH ──────────────────────────────────────────────────────────
  // Native ETH emits no event log of its own, so it must be read from
  // `assetChanges`. Regression suite for Cantina finding 1440 (retained native
  // ETH silently passing the guard).
  const ONE_ETH = 1_000000000000000000n;

  it("behavior: throws when bundles contract retains native ETH reported only in assetChanges", () => {
    // Before the fix this resolved instead of throwing (finding 1440).
    expect(() =>
      assertNoBundlesRetention({
        chainId: 1,
        transfers: [],
        assetChanges: [
          {
            account: BUNDLES_TARGET,
            changes: [{ token: ethAddress, diff: ONE_ETH }],
          },
        ],
      }),
    ).toThrow(BlacklistViolationError);
  });

  it("behavior: counts native ETH once when present in both a transfer log and assetChanges (eth_simulateV1 path)", () => {
    // eth_simulateV1 synthesizes native moves as `ethAddress` transfer logs and
    // derives assetChanges from them. The guard must not sum both sources.
    const transfers = [
      {
        token: ethAddress,
        from: USER,
        to: BUNDLES_TARGET,
        amount: ONE_ETH,
        txIdx: 0,
      },
    ];
    try {
      assertNoBundlesRetention({
        chainId: 1,
        transfers,
        assetChanges: [
          {
            account: BUNDLES_TARGET,
            changes: [{ token: ethAddress, diff: ONE_ETH }],
          },
        ],
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BlacklistViolationError);
      const changes = (err as BlacklistViolationError).assetChanges ?? [];
      expect(changes).toHaveLength(1);
      expect(changes[0]!.token?.toLowerCase()).toBe(ethAddress.toLowerCase());
      // Counted once (assetChanges), not doubled with the synthetic log.
      expect(changes[0]!.netRetained).toBe(ONE_ETH);
    }
  });

  it("behavior: falls back to native transfer logs when assetChanges has no native entry", () => {
    // Defense in depth: a backend that populates native transfers but not
    // assetChanges must still trip the guard.
    const transfers = [
      {
        token: ethAddress,
        from: USER,
        to: BUNDLES_TARGET,
        amount: ONE_ETH,
        txIdx: 0,
      },
    ];
    expect(() =>
      assertNoBundlesRetention({ chainId: 1, transfers, assetChanges: [] }),
    ).toThrow(BlacklistViolationError);
  });

  it("behavior: does not throw when native ETH passes through the bundles contract (net zero)", () => {
    expect(() =>
      assertNoBundlesRetention({
        chainId: 1,
        transfers: [],
        assetChanges: [
          {
            account: BUNDLES_TARGET,
            changes: [{ token: ethAddress, diff: 0n }],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("behavior: does not throw for native ETH retention below dust threshold", () => {
    expect(() =>
      assertNoBundlesRetention({
        chainId: 1,
        transfers: [],
        assetChanges: [
          {
            account: BUNDLES_TARGET,
            changes: [{ token: ethAddress, diff: 50n }],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("behavior: ignores native ETH assetChanges for non-bundles contract accounts", () => {
    expect(() =>
      assertNoBundlesRetention({
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
          to: BUNDLES_TARGET,
          amount: 1000000n,
        }),
      ]),
    ]);
    try {
      assertNoBundlesRetention({
        chainId: 1,
        transfers,
        assetChanges: [
          {
            account: BUNDLES_TARGET,
            changes: [{ token: ethAddress, diff: ONE_ETH }],
          },
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

describe("checkBundlesRetention", () => {
  const address = getAddress(getChainAddresses(1).bundles!.vaultBundlesV1!);
  const params = { chainId: 1, transfers: [], assetChanges: [] };

  test("returns no failure for empty flows and unsupported chains", () => {
    expect(checkBundlesRetention(params)).toEqual({
      status: "checked",
      failures: [],
      warnings: [],
    });
    expect(checkBundlesRetention({ ...params, chainId: -1 })).toMatchObject({
      status: "skipped-unsupported-chain",
      failures: [],
      warnings: [
        {
          code: "RETENTION_CHECK_SKIPPED",
          severity: "warn",
          chainId: -1,
          reason: "unsupported-chain",
        },
      ],
    });
  });

  test("preserves the aggregate retention error and native-before-token order", () => {
    const input = {
      chainId: 1,
      assetChanges: [
        { account: address, changes: [{ token: ethAddress, diff: 101n }] },
      ],
      transfers: [
        {
          from: zeroAddress,
          to: address,
          token: zeroAddress,
          amount: 102n,
          txIdx: 0,
        },
      ],
    };
    const { failures } = checkBundlesRetention(input);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toBeInstanceOf(BlacklistViolationError);
    expect(failures[0]?.assetChanges).toEqual([
      { address, token: ethAddress, netRetained: 101n },
      { address, token: zeroAddress, netRetained: 102n },
    ]);
    expect(() => assertNoBundlesRetention(input)).toThrowError(failures[0]);
  });
});

describe("planBundlesRetentionReads", () => {
  test("default: one balanceOf read per restricted intermediary and token", () => {
    const reads = planBundlesRetentionReads({
      chainId: ONLY_MIDNIGHT_CHAIN_ID,
      tokens: [USDC, DAI, USDC.toLowerCase() as Address],
    });
    expect(reads.map(({ id, to }) => ({ id, to }))).toEqual([
      { id: `retention:${USDC}:${MIDNIGHT_BUNDLES}`.toLowerCase(), to: USDC },
      { id: `retention:${DAI}:${MIDNIGHT_BUNDLES}`.toLowerCase(), to: DAI },
    ]);
    expect(reads[0]).toMatchObject({
      kind: "erc20.balance",
      token: USDC,
      account: MIDNIGHT_BUNDLES,
    });
    for (const read of reads) {
      expect(
        decodeFunctionData({ abi: erc20Abi, data: read.data }),
      ).toStrictEqual({ functionName: "balanceOf", args: [MIDNIGHT_BUNDLES] });
    }
  });

  test("behavior: covers every restricted intermediary of the chain", () => {
    const reads = planBundlesRetentionReads({
      chainId: BUNDLES_AND_MIDNIGHT_CHAIN_ID,
      tokens: [USDC],
    });
    expect(
      reads.map((read) => read.kind === "erc20.balance" && read.account),
    ).toEqual(
      expect.arrayContaining([
        BUNDLES_TARGET,
        BLUE_BUNDLES,
        VAULT_EXIT_BUNDLES,
        MIDNIGHT_BUNDLES,
      ]),
    );
    for (const read of reads) {
      expect(
        decodeFunctionData({ abi: erc20Abi, data: read.data }).args,
      ).toStrictEqual([read.kind === "erc20.balance" && read.account]);
    }
  });

  test("behavior: plans nothing without tokens, for native ETH, or without restricted intermediaries", () => {
    expect(planBundlesRetentionReads({ chainId: 1, tokens: [] })).toEqual([]);
    expect(
      planBundlesRetentionReads({ chainId: 1, tokens: [ethAddress] }),
    ).toEqual([]);
    expect(
      planBundlesRetentionReads({
        chainId: NO_BUNDLES_CHAIN_ID,
        tokens: [USDC],
      }),
    ).toEqual([]);
    expect(planBundlesRetentionReads({ chainId: -1, tokens: [USDC] })).toEqual(
      [],
    );
  });
});

describe("checkBundlesRetention with in-block balances", () => {
  const [read] = planBundlesRetentionReads({
    chainId: ONLY_MIDNIGHT_CHAIN_ID,
    tokens: [USDC],
  });
  const balances = (before: bigint, after: bigint) => ({
    reads: [read!],
    before: new Map([[read!.id, before]]),
    after: new Map([[read!.id, after]]),
  });
  const forgedPair = parseTransfers([
    makeCall([
      makeTransferLog({
        token: USDC,
        from: USER,
        to: MIDNIGHT_BUNDLES,
        amount: 1_000_000n,
      }),
      makeTransferLog({
        token: USDC,
        from: MIDNIGHT_BUNDLES,
        to: VAULT,
        amount: 1_000_000n,
      }),
    ]),
  ]);

  test("error: BlacklistViolationError when a forged equal-and-opposite log pair hides a retained balance", () => {
    const params = {
      chainId: ONLY_MIDNIGHT_CHAIN_ID,
      transfers: forgedPair,
      assetChanges: [],
    };
    expect(checkBundlesRetention(params).failures).toEqual([]);

    const { failures } = checkBundlesRetention({
      ...params,
      balances: balances(5n, 1_000_005n),
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toBeInstanceOf(BlacklistViolationError);
    expect(failures[0]?.assetChanges).toEqual([
      { address: MIDNIGHT_BUNDLES, token: USDC, netRetained: 1_000_000n },
    ]);
  });

  test("behavior: passes when state confirms the pass-through", () => {
    expect(
      checkBundlesRetention({
        chainId: ONLY_MIDNIGHT_CHAIN_ID,
        transfers: forgedPair,
        assetChanges: [],
        balances: balances(5n, 5n),
      }).failures,
    ).toEqual([]);
  });

  test("behavior: tolerates dust and swept balances in state", () => {
    for (const [before, after] of [
      [0n, 100n],
      [1_000n, 0n],
    ] as const) {
      expect(
        checkBundlesRetention({
          chainId: ONLY_MIDNIGHT_CHAIN_ID,
          transfers: [],
          assetChanges: [],
          balances: balances(before, after),
        }).failures,
      ).toEqual([]);
    }
  });

  test("behavior: reports the larger amount once when logs and state both flag a pair", () => {
    const transfers = parseTransfers([
      makeCall([
        makeTransferLog({
          token: USDC,
          from: USER,
          to: MIDNIGHT_BUNDLES,
          amount: 500n,
        }),
      ]),
    ]);
    const failure = (after: bigint) =>
      checkBundlesRetention({
        chainId: ONLY_MIDNIGHT_CHAIN_ID,
        transfers,
        assetChanges: [],
        balances: balances(0n, after),
      }).failures[0]?.assetChanges;
    expect(failure(900n)).toEqual([
      { address: MIDNIGHT_BUNDLES, token: USDC, netRetained: 900n },
    ]);
    expect(failure(200n)).toEqual([
      { address: MIDNIGHT_BUNDLES, token: USDC, netRetained: 500n },
    ]);
  });

  test("behavior: skips a pair whose balance read is missing in either phase and marks coverage incomplete", () => {
    const result = checkBundlesRetention({
      chainId: ONLY_MIDNIGHT_CHAIN_ID,
      transfers: [],
      assetChanges: [],
      balances: {
        reads: [read!],
        before: new Map(),
        after: new Map([[read!.id, 10_000n]]),
      },
    });
    expect(result.failures).toEqual([]);
    expect(result).toMatchObject({ status: "checked", incomplete: true });
    expect(
      checkBundlesRetention({
        chainId: ONLY_MIDNIGHT_CHAIN_ID,
        transfers: [],
        assetChanges: [],
        balances: balances(5n, 5n),
      }),
    ).not.toHaveProperty("incomplete");
  });
});
