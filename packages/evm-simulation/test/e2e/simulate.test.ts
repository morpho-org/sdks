import type { ActionRequirement } from "@morpho-org/morpho-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import { type Address, type Chain, ethAddress } from "viem";
import { describe, expect, test, vi } from "vitest";
import {
  compareE2eChanges,
  expectE2eReport,
  prepareE2eTransactions,
} from "./simulate.js";

const maker: Address = "0x00000000000000000000000000000000000000AA";
const taker: Address = "0x00000000000000000000000000000000000000bb";
const token: Address = "0x00000000000000000000000000000000000000cc";
const other: Address = "0x00000000000000000000000000000000000000dd";
const base = {
  wallets: [maker, taker],
  tokens: [token],
  sender: taker,
  gasFees: 0n,
  assetChanges: [
    { account: maker, changes: [{ token, diff: 7n }] },
    { account: taker, changes: [{ token, diff: -7n }] },
  ],
  deltas: [
    { account: maker, token, diff: 7n },
    { account: taker, token, diff: -7n },
  ],
} as const;

describe("expectE2eReport", () => {
  const retentionWarning = {
    severity: "warn",
    code: "RETENTION_CHECK_SKIPPED",
    chainId: 534352,
    message: "Retention check skipped",
    reason: "missing-restricted-addresses",
  } as const;

  test("accepts an explicitly allowed warning", () => {
    expect(() =>
      expectE2eReport({ ok: true, warnings: [retentionWarning] }, [
        "RETENTION_CHECK_SKIPPED",
      ]),
    ).not.toThrow();
  });

  test("accepts an unused warning allowlist", () => {
    expect(() =>
      expectE2eReport({ ok: true, warnings: [] }, ["RETENTION_CHECK_SKIPPED"]),
    ).not.toThrow();
  });

  test("rejects warnings outside the explicit allowlist", () => {
    expect(() =>
      expectE2eReport({ ok: true, warnings: [retentionWarning] }, [
        "BUNDLES_BALANCE_SWEPT",
      ]),
    ).toThrow();
  });

  test("rejects a failed report even when its warnings are allowed", () => {
    expect(() =>
      expectE2eReport({ ok: false, warnings: [retentionWarning] }, [
        "RETENTION_CHECK_SKIPPED",
      ]),
    ).toThrow();
  });

  test("accepts a successful report with no warnings", () => {
    expect(() => expectE2eReport({ ok: true, warnings: [] })).not.toThrow();
  });

  test("rejects an otherwise successful report with a warning", () => {
    expect(() =>
      expectE2eReport({
        ok: true,
        warnings: [
          {
            severity: "warn",
            code: "RETENTION_CHECK_SKIPPED",
            chainId: 1,
            message: "Retention check skipped",
            reason: "unsupported-chain",
          },
        ],
      }),
    ).toThrow();
  });

  test("rejects a failure even without warnings", () => {
    expect(() => expectE2eReport({ ok: false, warnings: [] })).toThrow();
  });

  test("retains failure diagnostics in the assertion's received object", () => {
    const report = {
      ok: false,
      severity: "fatal",
      failures: [new Error("simulation reverted")],
      warnings: [
        {
          severity: "warn",
          code: "RETENTION_CHECK_SKIPPED",
          chainId: 1,
          message: "Retention check skipped",
          reason: "unsupported-chain",
        },
      ],
    } as const;
    expect(() => expectE2eReport(report)).toThrow(
      expect.objectContaining({ actual: report }),
    );
  });

  test("rejects severity on a successful report", () => {
    const report = { ok: true, warnings: [], severity: "warn" } as const;
    expect(() => expectE2eReport(report)).toThrow();
  });
});

describe("compareE2eChanges", () => {
  test("matches both wallets, with case-insensitive addresses", () => {
    expect(
      compareE2eChanges({
        ...base,
        assetChanges: base.assetChanges.map((entry) => ({
          account: entry.account.toLowerCase() as Address,
          changes: entry.changes.map((change) => ({
            ...change,
            token: token.toLowerCase() as Address,
          })),
        })),
      }),
    ).toEqual([]);
  });

  test("returns a divergence for a non-sender wallet", () => {
    expect(
      compareE2eChanges({
        ...base,
        deltas: [{ account: maker, token, diff: 8n }, base.deltas[1]],
      }),
    ).toEqual([{ account: maker, token, expected: 7n, actual: 8n }]);
  });

  test("treats missing simulated entries as zero", () => {
    expect(
      compareE2eChanges({
        ...base,
        assetChanges: [],
        deltas: base.deltas.map((entry) => ({ ...entry, diff: 0n })),
      }),
    ).toEqual([]);
  });

  test("detects executed changes absent from simulation", () => {
    expect(compareE2eChanges({ ...base, assetChanges: [] })).toHaveLength(2);
  });

  test("handles empty inputs", () => {
    expect(
      compareE2eChanges({
        ...base,
        wallets: [],
        tokens: [],
        assetChanges: [],
        deltas: [],
      }),
    ).toEqual([]);
  });

  test("does not silently accept missing measured pairs", () => {
    expect(compareE2eChanges({ ...base, deltas: [base.deltas[1]] })).toEqual([
      { account: maker, token, expected: 7n, actual: undefined },
    ]);
  });

  test("rejects an untracked simulated token for a tracked wallet", () => {
    expect(
      compareE2eChanges({
        ...base,
        assetChanges: [
          {
            account: maker,
            changes: [
              ...base.assetChanges[0].changes,
              { token: other, diff: 2n },
            ],
          },
          base.assetChanges[1],
        ],
      }),
    ).toEqual([
      { account: maker, token: other, expected: 2n, actual: undefined },
    ]);
  });

  test("ignores changes for untracked wallets", () => {
    expect(
      compareE2eChanges({
        ...base,
        assetChanges: [
          ...base.assetChanges,
          { account: other, changes: [{ token: other, diff: 2n }] },
        ],
      }),
    ).toEqual([]);
  });

  test("adds back fees only to the sender's native balance", () => {
    expect(
      compareE2eChanges({
        ...base,
        tokens: [ethAddress],
        gasFees: 3n,
        assetChanges: [
          { account: maker, changes: [{ token: ethAddress, diff: 7n }] },
          { account: taker, changes: [{ token: ethAddress, diff: -7n }] },
        ],
        deltas: [
          { account: maker, token: ethAddress, diff: 7n },
          { account: taker, token: ethAddress, diff: -10n },
        ],
      }),
    ).toEqual([]);
  });

  test("does not hide native divergence after fee normalization", () => {
    expect(
      compareE2eChanges({
        ...base,
        wallets: [taker],
        tokens: [ethAddress],
        gasFees: 3n,
        assetChanges: [],
        deltas: [{ account: taker, token: ethAddress, diff: -4n }],
      }),
    ).toEqual([
      { account: taker, token: ethAddress, expected: 0n, actual: -1n },
    ]);
  });
});

describe("prepareE2eTransactions", () => {
  const client = {} as AnvilTestClient<Chain>;
  const tx = {
    to: token,
    data: "0x",
    value: 0n,
    action: { type: "erc20Approval", args: { spender: other, amount: 1n } },
  } as const;

  test("default: keeps calls ordered and passes actor-signed permits to the builder", async () => {
    const signature = { action: { type: "permit" } } as const;
    const sign = vi.fn().mockResolvedValue(signature);
    const buildTx = vi.fn().mockReturnValue(tx);
    const first = { ...tx, to: other, data: "0x01", value: 1n } as const;
    const second = { ...tx, data: "0x02", value: 2n } as const;
    const requirements = [
      first,
      { sign },
      second,
    ] as unknown as readonly ActionRequirement[];
    const { transactions } = await prepareE2eTransactions(client, {
      account: taker,
      output: { getRequirements: async () => requirements, buildTx },
    });
    expect(sign).toHaveBeenCalledWith(client, taker);
    expect(buildTx).toHaveBeenCalledWith([signature]);
    expect(transactions).toEqual(
      [first, second, tx].map(({ to, data, value }) => ({
        from: taker,
        to,
        data,
        value,
      })),
    );
  });

  test("behavior: no prerequisites still builds the action", async () => {
    const buildTx = vi.fn().mockReturnValue(tx);
    const { transactions } = await prepareE2eTransactions(client, {
      account: taker,
      output: { getRequirements: async () => [], buildTx },
    });
    expect(buildTx).toHaveBeenCalledWith([]);
    expect(transactions).toHaveLength(1);
  });

  test("error: a failed signature stops before building", async () => {
    const error = new Error("signing rejected");
    const sign = vi.fn().mockRejectedValue(error);
    const buildTx = vi.fn();
    await expect(
      prepareE2eTransactions(client, {
        account: taker,
        output: {
          getRequirements: async () =>
            [{ sign }] as unknown as readonly ActionRequirement[],
          buildTx,
        },
      }),
    ).rejects.toBe(error);
    expect(buildTx).not.toHaveBeenCalled();
  });
});
