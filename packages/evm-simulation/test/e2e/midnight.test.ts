import type { ActionRequirement } from "@morpho-org/morpho-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import { type Address, type Chain, ethAddress } from "viem";
import { describe, expect, test, vi } from "vitest";
import {
  compareE2eMidnightChanges,
  E2eMidnightSignatureRequirementError,
  sendE2eMidnightSimulated,
} from "./midnight.js";

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

describe("compareE2eMidnightChanges", () => {
  test("matches both wallets, with case-insensitive addresses", () => {
    expect(
      compareE2eMidnightChanges({
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
      compareE2eMidnightChanges({
        ...base,
        deltas: [{ account: maker, token, diff: 8n }, base.deltas[1]],
      }),
    ).toEqual([{ account: maker, token, expected: 7n, actual: 8n }]);
  });

  test("treats missing simulated entries as zero", () => {
    expect(
      compareE2eMidnightChanges({
        ...base,
        assetChanges: [],
        deltas: base.deltas.map((entry) => ({ ...entry, diff: 0n })),
      }),
    ).toEqual([]);
  });

  test("detects executed changes absent from simulation", () => {
    expect(
      compareE2eMidnightChanges({ ...base, assetChanges: [] }),
    ).toHaveLength(2);
  });

  test("handles empty inputs", () => {
    expect(
      compareE2eMidnightChanges({
        ...base,
        wallets: [],
        tokens: [],
        assetChanges: [],
        deltas: [],
      }),
    ).toEqual([]);
  });

  test("does not silently accept missing measured pairs", () => {
    expect(
      compareE2eMidnightChanges({ ...base, deltas: [base.deltas[1]] }),
    ).toEqual([{ account: maker, token, expected: 7n, actual: undefined }]);
  });

  test("rejects an untracked simulated token for a tracked wallet", () => {
    expect(
      compareE2eMidnightChanges({
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
      compareE2eMidnightChanges({
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
      compareE2eMidnightChanges({
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
      compareE2eMidnightChanges({
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

test("rejects signature requirements before building, simulating or sending any calls", async () => {
  const client = {} as AnvilTestClient<Chain>;
  const buildTx = vi.fn();
  const sign = vi.fn();
  const requirements = [
    { to: token, data: "0x", value: 0n },
    { sign },
  ] as unknown as readonly ActionRequirement[];
  await expect(
    sendE2eMidnightSimulated(client, {
      chainId: 1,
      account: taker,
      wallets: [maker, taker],
      tokens: [token],
      output: { getRequirements: async () => requirements, buildTx },
    }),
  ).rejects.toBeInstanceOf(E2eMidnightSignatureRequirementError);
  expect(buildTx).not.toHaveBeenCalled();
  expect(sign).not.toHaveBeenCalled();
});
