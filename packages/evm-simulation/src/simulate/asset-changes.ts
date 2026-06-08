import { type Address, getAddress } from "viem";
import type { AccountAssetChanges, AssetChange } from "../types.js";

/** A single signed contribution to one account's balance for one token. */
export interface AssetChangeEntry {
  account: Address;
  token: Address;
  diff: bigint;
  symbol?: string;
  decimals?: number;
}

// Locale-independent byte-order compare on lowercased hex, matching `sortTransfers`.
const compareAddress = (a: Address, b: Address) => {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return al < bl ? -1 : al > bl ? 1 : 0;
};

/**
 * Net signed per-(account, token) contributions into balance changes grouped by
 * account. Accounts and their `changes` are sorted by address for deterministic
 * output; zero-net tokens and accounts are dropped.
 *
 * @param entries - Signed contributions; `diff` is added per (account, token).
 * @returns One {@link AccountAssetChanges} per account with a non-zero change.
 */
export function groupAssetChanges(
  entries: AssetChangeEntry[],
): AccountAssetChanges[] {
  const byAccount = new Map<Address, Map<Address, AssetChange>>();
  for (const entry of entries) {
    if (entry.diff === 0n) continue;
    const account = getAddress(entry.account);
    // `token` is normalized by callers (checksummed contract or `ethAddress`).
    const token = entry.token;
    let tokens = byAccount.get(account);
    if (!tokens) byAccount.set(account, (tokens = new Map()));
    const prev = tokens.get(token);
    tokens.set(token, {
      token,
      symbol: prev?.symbol ?? entry.symbol,
      decimals: prev?.decimals ?? entry.decimals,
      diff: (prev?.diff ?? 0n) + entry.diff,
    });
  }

  return [...byAccount]
    .map(([account, tokens]) => ({
      account,
      changes: [...tokens.values()]
        .filter((c) => c.diff !== 0n)
        .sort((x, y) => compareAddress(x.token, y.token)),
    }))
    .filter((a) => a.changes.length > 0)
    .sort((a, b) => compareAddress(a.account, b.account));
}
