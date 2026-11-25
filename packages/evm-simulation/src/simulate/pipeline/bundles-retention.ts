import {
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { isDefined } from "@morpho-org/morpho-ts";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  ethAddress,
  getAddress,
} from "viem";
import { BlacklistViolationError } from "../../errors.js";
import type { SimulationReportVerification } from "../../result.js";
import type { AccountAssetChanges, Transfer } from "../../types.js";
import { freezeWarning, type SimulationWarning } from "../../warnings.js";
import type { StateRead } from "../state/contract.js";
import type { StateValue } from "../state/read-state.js";

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

/** `balanceOf` reads of restricted intermediaries, decoded per phase. @internal */
interface BundlesRetentionBalances {
  readonly reads: readonly StateRead[];
  readonly before: ReadonlyMap<string, StateValue>;
  readonly after: ReadonlyMap<string, StateValue>;
}

interface AssertNoBundlesRetentionParams {
  chainId: number;
  transfers: Transfer[];
  assetChanges: readonly AccountAssetChanges[];
  /**
   * In-block token balances of the restricted intermediaries. A balance that
   * grows above dust fails even when the transfer logs net to zero.
   */
  balances?: BundlesRetentionBalances;
}

/**
 * Resolve the chain's restricted intermediaries: its standalone `bundles`
 * contracts and `MidnightBundlesV2`.
 * @returns The checksummed addresses, or the `RETENTION_CHECK_SKIPPED` warning
 *   when blue-sdk does not support the chain or catalogs none for it.
 * @throws Any non-`UnsupportedChainIdError` error from `getChainAddresses`.
 */
function getRestrictedAddresses(
  chainId: number,
):
  | { readonly addresses: ReadonlySet<Address> }
  | { readonly skipped: SimulationWarning } {
  let addresses: ReturnType<typeof getChainAddresses>;
  try {
    addresses = getChainAddresses(chainId);
  } catch (error) {
    if (error instanceof UnsupportedChainIdError) {
      return {
        skipped: freezeWarning({
          code: "RETENTION_CHECK_SKIPPED",
          severity: "warn",
          chainId,
          message: "Chain not supported by blue-sdk, retention check skipped",
          reason: "unsupported-chain",
        }),
      };
    }
    throw error;
  }

  const restrictedAddresses = new Set<Address>();
  if (addresses.bundles) {
    for (const addr of Object.values(addresses.bundles).filter(isDefined)) {
      restrictedAddresses.add(getAddress(addr));
    }
  }
  if (addresses.midnightBundlesV2) {
    restrictedAddresses.add(getAddress(addresses.midnightBundlesV2));
  }
  if (restrictedAddresses.size === 0) {
    return {
      skipped: freezeWarning({
        code: "RETENTION_CHECK_SKIPPED",
        severity: "warn",
        chainId,
        message:
          "Chain known to blue-sdk but has no restricted intermediary config, retention check skipped",
        reason: "missing-restricted-addresses",
      }),
    };
  }
  return { addresses: restrictedAddresses };
}

/**
 * Plan one `balanceOf` read per (restricted intermediary, token) pair, replayed
 * before and after the user bundle in the same simulated block, so retention
 * is checked against token state and not only against reported logs.
 *
 * @internal Internal pipeline stage, composed by `simulate`.
 * @param params.chainId - Chain whose restricted intermediaries are read.
 * @param params.tokens - ERC-20 tokens the request's operations measure;
 *   duplicates are read once. Native ETH is not an ERC-20 and is skipped.
 * @returns The reads, empty when the chain has no restricted intermediary.
 * @throws Any non-`UnsupportedChainIdError` error from `getChainAddresses`.
 */
export function planBundlesRetentionReads(params: {
  readonly chainId: number;
  readonly tokens: readonly Address[];
}): readonly StateRead[] {
  if (params.tokens.length === 0) {
    return [];
  }
  const restricted = getRestrictedAddresses(params.chainId);
  if (!("addresses" in restricted)) {
    return [];
  }
  const reads = new Map<string, StateRead>();
  for (const account of restricted.addresses) {
    for (const token of params.tokens) {
      if (token.toLowerCase() === ethAddress) {
        continue;
      }
      const id = `retention:${token}:${account}`.toLowerCase();
      if (reads.has(id)) {
        continue;
      }
      reads.set(id, {
        kind: "erc20.balance",
        id,
        to: token,
        token,
        account,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        }),
      });
    }
  }
  return [...reads.values()];
}

/**
 * Find value retained by standalone `bundles` periphery contracts
 * (`VaultExitBundlesV1`, `VaultBundlesV1`, `BlueBundlesV1`) or by
 * `MidnightBundlesV2` (`midnightBundlesV2`).
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
 * **Two flow sources, one per asset class.** ERC20 / WETH9 retention is read
 * from parsed `transfers` (log-derived). Native ETH emits no event log of its
 * own, so it is read from `assetChanges`, the source of truth for native value,
 * which `eth_simulateV1` derives from the synthetic `traceTransfers` logs.
 * Without this, native ETH stuck in a bundles contract would pass the guard
 * undetected (Cantina finding 1440).
 *
 * To avoid double-counting native ETH on `eth_simulateV1` — where the same
 * native move exists both as a synthetic `ethAddress` transfer log *and* in the
 * `assetChanges` derived from it — native transfer logs are only used as a
 * fallback for bundles addresses that carry no native `assetChanges` entry.
 *
 * @internal Internal pipeline stage, composed by `simulate`; not part of the
 *   package's public API (only re-exported from the internal pipeline barrel).
 * @param params.chainId - Chain whose blue-sdk `bundles` and `midnightBundlesV2`
 *   registry entries define the restricted address set. Chains cataloging
 *   neither are skipped with a structured warning and explicit coverage status.
 * @param params.transfers - Parsed ERC20 / WETH9 transfer flows (plus the
 *   `eth_simulateV1` synthetic native sentinel) scanned for net retention.
 * @param params.assetChanges - Per-account native-ETH deltas, the source of
 *   truth for native value stuck in a restricted contract.
 * @param params.balances - Decoded before/after `balanceOf` reads planned by
 *   {@link planBundlesRetentionReads}. A pair whose balance grows above dust
 *   is retained even when its logs net to zero; when both sources flag a
 *   pair, the larger amount is reported.
 * @returns Retention coverage, non-blocking diagnostics and any aggregate
 *   retained-value failure. `incomplete` is set when a planned balance read is
 *   missing in either phase, so that pair went unmeasured.
 */
export function checkBundlesRetention(params: AssertNoBundlesRetentionParams): {
  readonly status: SimulationReportVerification["retention"];
  readonly incomplete?: true;
  readonly warnings: readonly SimulationWarning[];
  readonly failures: readonly BlacklistViolationError[];
} {
  const { chainId, transfers, assetChanges, balances } = params;
  const warnings: SimulationWarning[] = [];

  const restricted = getRestrictedAddresses(chainId);
  if (!("addresses" in restricted)) {
    return {
      status: "skipped-unsupported-chain",
      failures: [],
      warnings: [restricted.skipped],
    };
  }
  const restrictedAddresses = restricted.addresses;

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

  // Native ETH from `assetChanges` (authoritative). Track which restricted
  // contracts already have a native entry here so the transfer-log pass below
  // does not re-add the same native move on `eth_simulateV1`.
  const nativeFromAssetChanges = new Set<string>();
  for (const { account, changes } of assetChanges) {
    if (!restrictedAddresses.has(account)) {
      continue;
    }
    for (const change of changes) {
      if (change.token !== ethAddress) {
        continue;
      }
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
    if (restrictedAddresses.has(t.to) && !usesAssetChangeNative(t, t.to)) {
      recordFlow(t.to, t.token, t.amount);
    }
    if (restrictedAddresses.has(t.from) && !usesAssetChangeNative(t, t.from)) {
      recordFlow(t.from, t.token, -t.amount);
    }
  }

  const entries = [...flow.values()];
  const drained = entries.filter((e) => e.netChange < -DUST_THRESHOLD);
  for (const entry of drained) {
    warnings.push(
      freezeWarning({
        code: "BUNDLES_BALANCE_SWEPT",
        severity: "warn",
        chainId,
        message:
          "Simulation detected pre-existing balance being swept from a restricted bundles contract",
        address: entry.address,
        token: entry.token,
        netSwept: -entry.netChange,
      }),
    );
  }

  const retained = new Map(
    entries
      .filter((e) => e.netChange > DUST_THRESHOLD)
      .map((e) => [
        `${e.address.toLowerCase()}:${e.token.toLowerCase()}`,
        { ...e },
      ]),
  );
  let incomplete = false;
  for (const read of balances?.reads ?? []) {
    if (read.kind !== "erc20.balance") {
      continue;
    }
    const before = balances?.before.get(read.id);
    const after = balances?.after.get(read.id);
    if (typeof before !== "bigint" || typeof after !== "bigint") {
      incomplete = true;
      continue;
    }
    const netChange = after - before;
    const key = `${read.account.toLowerCase()}:${read.token.toLowerCase()}`;
    if (
      netChange > DUST_THRESHOLD &&
      !((retained.get(key)?.netChange ?? 0n) >= netChange)
    ) {
      retained.set(key, {
        address: getAddress(read.account),
        token: getAddress(read.token),
        netChange,
      });
    }
  }

  const coverage: { readonly status: "checked"; readonly incomplete?: true } =
    incomplete
      ? { status: "checked", incomplete: true }
      : { status: "checked" };
  if (retained.size > 0) {
    return {
      ...coverage,
      warnings,
      failures: [
        new BlacklistViolationError(
          "Simulation detected asset transfers retained by restricted bundles contracts",
          [...retained.values()].map((e) => ({
            address: e.address,
            token: e.token,
            netRetained: e.netChange,
          })),
        ),
      ],
    };
  }
  return { ...coverage, warnings, failures: [] };
}

/** Reject the aggregate bundles-retention failure, if present. @internal */
export function assertNoBundlesRetention(
  params: AssertNoBundlesRetentionParams,
): void {
  const [failure] = checkBundlesRetention(params).failures;
  if (failure !== undefined) {
    throw failure;
  }
}
