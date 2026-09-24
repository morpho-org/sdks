import {
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { isDefined } from "@morpho-org/morpho-ts";
import { type Address, ethAddress, getAddress } from "viem";
import { BlacklistViolationError } from "../../errors.js";
import type {
  AccountAssetChanges,
  SimulationLogger,
  Transfer,
} from "../../types.js";

/**
 * Dust tolerance for standalone bundles retention, in raw token units.
 *
 * 100 units is negligible for 18-decimal tokens (~1e-16). For low-decimal
 * tokens (e.g., 2-decimal stablecoins) this represents ~1.00 token — worth
 * keeping in mind. The threshold is intentionally token-agnostic: its purpose
 * is to absorb routing rounding noise, not to define an acceptable retention
 * amount.
 */
const DUST_THRESHOLD = 100n;

interface BundlesRetentionEntry {
  address: Address;
  token: Address;
  netChange: bigint;
}

interface AssertNoBundlesRetentionParams {
  chainId: number;
  transfers: Transfer[];
  assetChanges: readonly AccountAssetChanges[];
  logger?: SimulationLogger;
}

/**
 * Assert that no value is retained by standalone `bundles` periphery contracts
 * (`VaultExitBundlesV1`, `VaultBundlesV1`, `BlueBundlesV1`) or by
 * `MidnightBundlesV1` (`midnightBundles`).
 *
 * Uses net flow (inbound minus outbound) per (restricted address, token) pair.
 * These contracts legitimately receive tokens as an intermediary (user →
 * bundles contract → vault), so gross inbound would fire false positives. We
 * only block positive net flow above `DUST_THRESHOLD` — value stuck in a
 * restricted address. Negative net flow means the simulated bundle sweeps a
 * pre-existing or state-overridden balance. That is useful telemetry, but not
 * current-bundle retention, so it is warned instead of raising a blacklist
 * violation.
 *
 * ERC20 / WETH9 retention is read from parsed `transfers`. Native ETH is
 * read from `assetChanges`, derived from synthetic `traceTransfers` logs.
 * Both top-level value and internal native transfers participate in retention.
 *
 * To avoid double-counting native ETH on `eth_simulateV1` — where the same
 * native move exists both as a synthetic `ethAddress` transfer log *and* in the
 * `assetChanges` derived from it — native transfer logs are only used as a
 * fallback for bundles addresses that carry no native `assetChanges` entry.
 *
 * @internal Internal pipeline stage, composed by `simulate`; not part of the
 *   package's public API (only re-exported from the internal pipeline barrel).
 * @param params.chainId - Chain whose blue-sdk `bundles` and `midnightBundles`
 *   registry entries define the restricted address set. Chains cataloging
 *   neither are skipped (a `logger.warn` records the skip).
 * @param params.transfers - Parsed ERC20 / WETH9 transfer flows (plus the
 *   `eth_simulateV1` synthetic native sentinel) scanned for net retention.
 * @param params.assetChanges - Per-account native-ETH deltas, the aggregate
 *   source of truth for native value stuck in a restricted contract.
 * @param params.logger - Optional logger. Receives retention-check skip warnings
 *   and pre-existing-balance sweep telemetry (net-negative flow).
 * @returns Nothing. Returns silently when no restricted contract retains value
 *   above `DUST_THRESHOLD`; otherwise throws.
 * @throws {BlacklistViolationError} when net inbound flow to a restricted
 *   `bundles` or `midnightBundles` contract exceeds `DUST_THRESHOLD` for any
 *   token.
 */
export function assertNoBundlesRetention(
  params: AssertNoBundlesRetentionParams,
): void {
  const { chainId, transfers, assetChanges, logger } = params;

  // Standalone bundles contracts and `MidnightBundlesV1` are transient
  // intermediaries that route user value and must never retain it.
  let addresses: ReturnType<typeof getChainAddresses>;
  try {
    addresses = getChainAddresses(chainId);
  } catch (error) {
    if (error instanceof UnsupportedChainIdError) {
      // Loud warn: this disables a "never bypassable" check for the chain.
      // Consumers relying on the guarantee must handle this signal.
      logger?.warn("Chain not supported by blue-sdk, retention check skipped", {
        chainId,
      });
      return;
    }
    throw error;
  }

  const restrictedAddresses = new Set<Address>();
  if (addresses.bundles) {
    for (const addr of Object.values(addresses.bundles).filter(isDefined))
      restrictedAddresses.add(getAddress(addr));
  }
  if (addresses.midnightBundles) {
    restrictedAddresses.add(getAddress(addresses.midnightBundles));
  }
  if (restrictedAddresses.size === 0) {
    // blue-sdk knows the chain but cataloged no restricted intermediary for it.
    // Treat the same as UnsupportedChainIdError — retention check skipped.
    logger?.warn(
      "Chain known to blue-sdk but has no restricted intermediary config, retention check skipped",
      { chainId },
    );
    return;
  }

  // Map keyed by (address, token) → structured entry. Avoids string parse-back.
  const flow = new Map<string, BundlesRetentionEntry>();

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
  // restricted contracts already have a native entry here so the transfer-log
  // pass below does not re-add the same native move on `eth_simulateV1`.
  const nativeFromAssetChanges = new Set<string>();
  for (const { account, changes } of assetChanges) {
    if (!restrictedAddresses.has(account)) continue;
    for (const change of changes) {
      if (change.token !== ethAddress) continue;
      recordFlow(account, ethAddress, change.diff);
      nativeFromAssetChanges.add(account.toLowerCase());
    }
  }

  // ERC20 / WETH9 retention from transfer logs. Native ETH transfers (the
  // `eth_simulateV1` synthetic sentinel) only backfill a restricted endpoint
  // that is absent from `nativeFromAssetChanges`, so native is never summed on
  // top of the `assetChanges` value already recorded for that address.
  const usesAssetChangeNative = (t: Transfer, addr: Address): boolean =>
    t.token === ethAddress && nativeFromAssetChanges.has(addr.toLowerCase());
  for (const t of transfers) {
    if (restrictedAddresses.has(t.to) && !usesAssetChangeNative(t, t.to))
      recordFlow(t.to, t.token, t.amount);
    if (restrictedAddresses.has(t.from) && !usesAssetChangeNative(t, t.from))
      recordFlow(t.from, t.token, -t.amount);
  }

  const entries = [...flow.values()];
  const drained = entries.filter((e) => e.netChange < -DUST_THRESHOLD);
  if (drained.length > 0) {
    logger?.warn(
      "Simulation detected pre-existing balance being swept from a restricted bundles contract",
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
      "Simulation detected asset transfers retained by restricted bundles contracts",
      retained.map((e) => ({
        address: e.address,
        token: e.token,
        netRetained: e.netChange.toString(),
      })),
    );
  }
}
