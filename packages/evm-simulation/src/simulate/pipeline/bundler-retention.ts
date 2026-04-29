import {
  UnsupportedChainIdError,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { isDefined } from "@morpho-org/morpho-ts";
import { type Address, getAddress } from "viem";

import type { SimulationLogger, Transfer } from "../../types.js";

import { BlacklistViolationError } from "../../errors.js";

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
  logger?: SimulationLogger;
}

/**
 * Assert that no value is retained by bundler3 contract addresses.
 *
 * Uses net flow (inbound minus outbound) per (bundler address, token) pair.
 * Bundler3 legitimately receives tokens as an intermediary (user → bundler3 →
 * vault), so gross inbound would fire false positives. We only flag when
 * `|net| > DUST_THRESHOLD` — catching both **retention** (tokens stuck in
 * bundler, positive net) and **drain** (bundler sending more than it received
 * in this bundle, negative net — which implies a pre-existing or state-override
 * balance is being drawn down, a red flag for pre-broadcast integrity).
 */
export function assertNoBundlerRetention(
  params: AssertNoBundlerRetentionParams,
): void {
  const { chainId, transfers, logger } = params;
  const bundlerAddresses = getBundlerAddresses(chainId, logger);
  if (bundlerAddresses.size === 0) return;

  // Map keyed by (bundler, token) → structured entry. Avoids string parse-back.
  const flow = new Map<string, BundlerEntry>();

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

  for (const t of transfers) {
    if (bundlerAddresses.has(t.to)) recordFlow(t.to, t.token, t.amount);
    if (bundlerAddresses.has(t.from)) recordFlow(t.from, t.token, -t.amount);
  }

  const flagged = [...flow.values()].filter(
    (e) => absBigInt(e.netChange) > DUST_THRESHOLD,
  );

  if (flagged.length > 0) {
    throw new BlacklistViolationError(
      "Simulation detected asset transfers retained or drained by restricted bundler contracts",
      flagged.map((e) => ({
        address: e.address,
        token: e.token,
        netRetained: e.netChange.toString(),
      })),
    );
  }
}

function absBigInt(x: bigint): bigint {
  return x < 0n ? -x : x;
}
