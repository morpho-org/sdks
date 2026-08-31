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

function getBundlerAddresses(
  chainId: number,
  logger?: SimulationLogger,
): Set<Address> {
  try {
    const addresses = getChainAddresses(chainId);
    if (!addresses.bundler3) {
      // blue-sdk knows the chain but didn't catalog a bundler3 for it.
      // Treat the same as UnsupportedChainIdError — retention check skipped.
      logger?.warn(
        "Chain known to blue-sdk but has no bundler3 config, retention check skipped",
        {
          chainId,
        },
      );
      return new Set();
    }
    return new Set(
      Object.values(addresses.bundler3)
        .filter(isDefined)
        .map((addr) => getAddress(addr)),
    );
  } catch (error) {
    if (error instanceof UnsupportedChainIdError) {
      // Loud warn: this disables a "never bypassable" check for the chain.
      // Consumers relying on the guarantee must handle this signal.
      logger?.warn("Chain not supported by blue-sdk, retention check skipped", {
        chainId,
      });
      return new Set();
    }
    throw error;
  }
}

interface AssertNoBundlerRetentionParams {
  chainId: number;
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
 *
 * **Known limitation (Cantina finding 1631).** This check runs on the simulated
 * bundle, which executes with the sender's native balance overridden to
 * `maxUint256 / 2` and no gas price. A step that succeeds here but reverts
 * on-chain *only because* the caller's real, post-gas native balance is too low
 * therefore evades this guard: if that step is `skipRevert: true`, Bundler3
 * skips it on-chain and earlier funds are stranded while this simulation
 * reports none retained. The Morpho builders keep native/value-carrying steps
 * `skipRevert: false` so no such divergence exists; raw-bundle callers must do
 * the same.
 */
export function assertNoBundlerRetention(
  params: AssertNoBundlerRetentionParams,
): void {
  const { chainId, transfers, assetChanges, logger } = params;
  const bundlerAddresses = getBundlerAddresses(chainId, logger);
  if (bundlerAddresses.size === 0) return;

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
    if (!bundlerAddresses.has(account)) continue;
    for (const change of changes) {
      if (change.token !== ethAddress) continue;
      recordFlow(account, ethAddress, change.diff);
      nativeFromAssetChanges.add(account.toLowerCase());
    }
  }

  // ERC20 / WETH9 retention from transfer logs. Native ETH transfers (the
  // `eth_simulateV1` synthetic sentinel) only backfill a bundler endpoint that
  // is absent from `nativeFromAssetChanges`, so native is never summed on top
  // of the `assetChanges` value already recorded for that address.
  const usesAssetChangeNative = (t: Transfer, addr: Address): boolean =>
    t.token === ethAddress && nativeFromAssetChanges.has(addr.toLowerCase());
  for (const t of transfers) {
    if (bundlerAddresses.has(t.to) && !usesAssetChangeNative(t, t.to))
      recordFlow(t.to, t.token, t.amount);
    if (bundlerAddresses.has(t.from) && !usesAssetChangeNative(t, t.from))
      recordFlow(t.from, t.token, -t.amount);
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
