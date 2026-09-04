import { type Address, ethAddress, getAddress, type Hex } from "viem";
import type { AccountAssetChanges, AssetChange } from "../types.js";

/** A single signed contribution to one account's balance for one token. */
export interface AssetChangeEntry {
  account: Address;
  token: Address;
  diff: bigint;
  symbol?: string;
  decimals?: number;
}

/**
 * Collapse the native-ETH sentinel to viem's lowercase `ethAddress`, checksumming
 * any real token address. `eth_simulateV1` synthesizes native moves from the
 * sentinel `0xeee…eee`, and Tenderly may echo it — in checksummed or any other
 * case — as an asset change's `contractAddress`. Native ETH is keyed by the exact
 * `ethAddress` constant here and in the bundler-retention guard, so a checksummed
 * sentinel would land on a separate map key and silently escape retention checks.
 * This is the single source of truth for token normalization shared by the
 * transfer-log parser and the Tenderly asset-change mapper.
 *
 * @param address - Token address emitting a transfer or carried by an asset change.
 * @returns `ethAddress` for the native sentinel, else the checksummed address.
 * @internal
 */
export function normalizeAssetToken(address: Hex): Address {
  return address.toLowerCase() === ethAddress
    ? ethAddress
    : getAddress(address);
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
