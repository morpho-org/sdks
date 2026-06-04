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

const byAddress = (a: { token: Address }, b: { token: Address }) =>
  a.token.toLowerCase().localeCompare(b.token.toLowerCase());

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
        .sort(byAddress),
    }))
    .filter((a) => a.changes.length > 0)
    .sort((a, b) =>
      a.account.toLowerCase().localeCompare(b.account.toLowerCase()),
    );
}
