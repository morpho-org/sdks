import {
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { type Address, ethAddress, getAddress } from "viem";
import {
  BlacklistViolationError,
  UnsupportedChainError,
} from "../../errors.js";
import type {
  AccountAssetChanges,
  SimulationLogger,
  Transfer,
} from "../../types.js";

/**
 * Dust tolerance for bundler retention, in raw token units.
 *
 * 100 units is negligible for 18-decimal tokens (~1e-16). For low-decimal
 * tokens (e.g., 2-decimal stablecoins) this represents ~1.00 token — worth
 * keeping in mind. The threshold is intentionally token-agnostic: its purpose
 * is to absorb rounding noise from bundler3 routing, not to define an
 * acceptable retention amount.
 */
const DUST_THRESHOLD = 100n;

interface BundlerEntry {
  address: Address;
  token: Address;
  netChange: bigint;
}

interface BundlerRetentionMetadata {
  readonly bundlerAddresses: ReadonlySet<Address>;
  readonly wNative?: Address;
}

/**
 * Resolves the chain metadata required to enforce bundler retention.
 *
 * @param chainId - Chain whose registered bundler addresses are required.
 * @returns One immutable metadata snapshot for parsing and retention checks.
 * @throws {UnsupportedChainError} when the active registry has no bundler metadata for the chain.
 * @internal
 */
export function resolveBundlerRetentionMetadata(
  chainId: number,
): BundlerRetentionMetadata {
  try {
    const addresses = getChainAddresses(chainId);
    if (!addresses.bundler3) {
      throw new UnsupportedChainError(chainId);
    }

    const bundlerAddresses = new Set(
      Object.values(addresses.bundler3)
        .filter((address) => address !== undefined)
        .map((address) => getAddress(address.toLowerCase())),
    );
    if (bundlerAddresses.size === 0) {
      throw new UnsupportedChainError(chainId);
    }

    return {
      bundlerAddresses,
      wNative:
        addresses.wNative == null
          ? undefined
          : getAddress(addresses.wNative.toLowerCase()),
    };
  } catch (error) {
    if (error instanceof UnsupportedChainIdError) {
      throw new UnsupportedChainError(chainId);
    }
    throw error;
  }
}

interface AssertNoBundlerRetentionParams {
  metadata: BundlerRetentionMetadata;
  transfers: Transfer[];
  assetChanges: readonly AccountAssetChanges[];
  logger?: SimulationLogger;
}

/**
 * Assert that no value is retained by bundler3 contract addresses.
 *
 * Uses net flow (inbound minus outbound) per (bundler address, token) pair.
 * Bundler3 legitimately receives tokens as an intermediary (user → bundler3 →
 * vault), so gross inbound would fire false positives. We only block positive
 * net flow above `DUST_THRESHOLD` — value stuck in a bundler address. Negative
 * net flow means the simulated bundle sweeps a pre-existing or state-overridden
 * bundler balance. That is useful telemetry, but not current-bundle retention,
 * so it is warned instead of raising a blacklist violation.
 *
 * **Two flow sources, one per asset class.** ERC20 / WETH9 retention is read
 * from parsed `transfers` (log-derived, identical across backends). Native ETH
 * emits no event log, so it can never appear in `transfers` on the Tenderly
 * primary backend — Tenderly derives native moves into `assetChanges` instead.
 * Native ETH is therefore read from `assetChanges`, the cross-backend source of
 * truth for native value: Tenderly derives it from its trace, and
 * `eth_simulateV1` derives it from the synthetic `traceTransfers` logs. Without
 * this, native ETH stuck in bundler3 would pass the guard undetected on the
 * Tenderly path (Cantina finding 1440).
 *
 * To avoid double-counting native ETH on `eth_simulateV1` — where the same
 * native move exists both as a synthetic `ethAddress` transfer log *and* in the
 * `assetChanges` derived from it — native transfer logs are only used as a
 * fallback for bundler addresses that carry no native `assetChanges` entry.
 */
export function assertNoBundlerRetention(
  params: AssertNoBundlerRetentionParams,
): void {
  const { metadata, transfers, assetChanges, logger } = params;
  const { bundlerAddresses } = metadata;

  // Map keyed by (bundler, token) → structured entry. Avoids string parse-back.
  const flow = new Map<string, BundlerEntry>();

  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  const recordFlow = (
    address: Address,
    token: Address,
    delta: bigint,
  ): void => {
    const key = `${address.toLowerCase()}:${token.toLowerCase()}`;
    const existing = flow.get(key);
    if (existing) {
      existing.netChange += delta;
    } else {
      flow.set(key, { address, token, netChange: delta });
    }
  };

  // Native ETH from `assetChanges` (authoritative, cross-backend). Track which
  // bundlers already have a native entry here so the transfer-log pass below
  // does not re-add the same native move on `eth_simulateV1`.
  const nativeFromAssetChanges = new Set<string>();
  for (const { account, changes } of assetChanges) {
    const normalizedAccount = getAddress(account.toLowerCase());
    if (!bundlerAddresses.has(normalizedAccount)) continue;
    for (const change of changes) {
      if (change.token.toLowerCase() !== ethAddress) continue;
      recordFlow(normalizedAccount, ethAddress, change.diff);
      nativeFromAssetChanges.add(normalizedAccount.toLowerCase());
    }
  }

  // ERC20 / WETH9 retention from transfer logs. Native ETH transfers (the
  // `eth_simulateV1` synthetic sentinel) only backfill a bundler endpoint that
  // is absent from `nativeFromAssetChanges`, so native is never summed on top
  // of the `assetChanges` value already recorded for that address.
  const usesAssetChangeNative = (t: Transfer, addr: Address): boolean =>
    t.token.toLowerCase() === ethAddress &&
    nativeFromAssetChanges.has(addr.toLowerCase());
  for (const t of transfers) {
    const to = getAddress(t.to.toLowerCase());
    const from = getAddress(t.from.toLowerCase());
    if (bundlerAddresses.has(to) && !usesAssetChangeNative(t, to))
      recordFlow(to, t.token, t.amount);
    if (bundlerAddresses.has(from) && !usesAssetChangeNative(t, from))
      recordFlow(from, t.token, -t.amount);
  }

  const entries = [...flow.values()];
  const drained = entries.filter((e) => e.netChange < -DUST_THRESHOLD);
  if (drained.length > 0) {
    logger?.warn(
      "Simulation detected pre-existing bundler balance being swept",
      {
        changes: drained.map((e) => ({
          address: e.address,
          token: e.token,
          netSwept: (-e.netChange).toString(),
        })),
      },
    );
  }

  const retained = entries.filter((e) => e.netChange > DUST_THRESHOLD);

  if (retained.length > 0) {
    throw new BlacklistViolationError(
      "Simulation detected asset transfers retained by restricted bundler contracts",
      retained.map((e) => ({
        address: e.address,
        token: e.token,
        netRetained: e.netChange.toString(),
      })),
    );
  }
}
