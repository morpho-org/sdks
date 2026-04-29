import { getAddress, zeroAddress } from "viem";
import { z } from "zod";

import type {
  SimulationLogger,
  SimulationTransaction,
  Transfer,
} from "../types.js";

import { AddressScreeningError } from "../errors.js";
import { sanctionedAddresses } from "./sanctioned-addresses.js";

const CHAINALYSIS_API_URL = "https://api.chainalysis.com/api/risk/v2/entities";
const CHAINALYSIS_TIMEOUT_MS = 5_000;

/**
 * Known tiers whose presence means NOT severe. Any other value (unknown future
 * tier, malformed field) is treated as Severe so a stricter tier Chainalysis
 * might introduce later isn't silently downgraded to clean.
 */
const NON_SEVERE_TIERS = new Set(["High", "Medium", "Low"]);

const chainalysisEntitySchema = z
  .object({
    risk: z.string().nullable(),
  })
  .passthrough();

type Verdict = "severe" | "clean";

/**
 * Screen all relevant addresses from a simulation for sanctioned/compromised addresses.
 *
 * Screening targets (deduped, lowercased, zero-addr removed):
 * - Transfer senders and recipients from simulation result
 * - `from` and `to` of every tx in `simulationTxs` (catches native-value flows)
 *
 * Checks run in order:
 * 1. Static {@link sanctionedAddresses} set (fast, no network, always on).
 * 2. Chainalysis Entity API — one lookup per address, lookups across addresses
 *    run in parallel. Only fires if `chainalysisApiKey` is provided.
 *    **Fail-open on transport errors before registration** (network / timeout /
 *    non-ok POST): the address is treated as clean, a warn is logged, and the
 *    simulation proceeds. This is the documented posture — a Chainalysis
 *    outage must not block all simulations.
 *    **Fail-closed on partial registration**: if the registration POST succeeded
 *    but the subsequent lookup GET fails, the address is treated as Severe.
 *    The data already persisted server-side, so failing open at this point
 *    would let a pass slip through based on a half-completed check.
 *    **Fail-closed on schema drift**: if Chainalysis returns an unknown risk
 *    tier or a body that doesn't parse, the address is treated as Severe so a
 *    future stricter tier isn't silently downgraded.
 *
 * Throws `AddressScreeningError` on any Severe hit. Intended to be called after
 * `simulate`, passing the returned `simulationTxs` and `transfers`.
 */
export async function screenAddresses(params: {
  simulationTxs: SimulationTransaction[];
  transfers: Transfer[];
  chainalysisApiKey?: string;
  signal?: AbortSignal;
  logger?: SimulationLogger;
}): Promise<void> {
  const { simulationTxs, transfers, chainalysisApiKey, signal, logger } =
    params;

  const addressesToScreen = new Set<string>();
  for (const transfer of transfers) {
    addressesToScreen.add(transfer.from.toLowerCase());
    addressesToScreen.add(transfer.to.toLowerCase());
  }
  for (const tx of simulationTxs) {
    addressesToScreen.add(tx.from.toLowerCase());
    addressesToScreen.add(tx.to.toLowerCase());
  }
  addressesToScreen.delete(zeroAddress);

  // 1. Static sanctioned list — always on, no network.
  const sanctioned: string[] = [];
  for (const addr of addressesToScreen) {
    if (sanctionedAddresses.has(addr)) sanctioned.push(getAddress(addr));
  }
  if (sanctioned.length > 0) {
    throw new AddressScreeningError(
      "Transaction involves sanctioned addresses",
      sanctioned,
    );
  }

  // 2. Chainalysis (optional).
  if (!chainalysisApiKey) {
    logger?.warn("Chainalysis screening skipped: no API key configured");
    return;
  }

  const results = await Promise.allSettled(
    [...addressesToScreen].map(async (addr) => {
      const verdict = await screenWithChainalysis(
        addr,
        chainalysisApiKey,
        signal,
      );
      return { addr, verdict };
    }),
  );

  const flagged: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.verdict === "severe") flagged.push(getAddress(r.value.addr));
    } else {
      // Transport fail-open: registration POST couldn't even complete, so the
      // address was never registered with Chainalysis and the package's
      // fail-open posture applies.
      logger?.warn("Chainalysis screening failed (fail-open)", {
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }

  if (flagged.length > 0) {
    throw new AddressScreeningError(
      "Transaction involves addresses flagged as Severe risk",
      flagged,
    );
  }
}

/**
 * Run the Chainalysis Entity flow for one address.
 *
 * Returns `'severe'` or `'clean'`. Throws only if the initial registration POST
 * fails before any server-side side effect — then the outer handler treats the
 * rejection as fail-open. After registration succeeds, every error path returns
 * `'severe'` so the check fails closed.
 *
 * A SINGLE deadline covers both the POST and the GET, keeping the per-address
 * wall-time budget at `CHAINALYSIS_TIMEOUT_MS` (5 s) rather than doubling it.
 */
async function screenWithChainalysis(
  address: string,
  apiKey: string,
  parentSignal?: AbortSignal,
): Promise<Verdict> {
  const headers = {
    "Content-Type": "application/json",
    token: apiKey,
  };

  const deadline = AbortSignal.timeout(CHAINALYSIS_TIMEOUT_MS);
  const signal = parentSignal
    ? AbortSignal.any([parentSignal, deadline])
    : deadline;

  // POST to register. Pre-registration failure → fail-open via thrown Error.
  const registration = await fetch(CHAINALYSIS_API_URL, {
    headers,
    method: "POST",
    body: JSON.stringify({ address }),
    signal,
  });
  if (!registration.ok) {
    throw new Error(
      `Chainalysis registration failed: ${registration.status} ${registration.statusText}`,
    );
  }

  // From here on we've already told Chainalysis about the address — fail closed.
  let response: Response;
  try {
    response = await fetch(
      `${CHAINALYSIS_API_URL}/${encodeURIComponent(address)}`,
      {
        method: "GET",
        headers,
        signal,
      },
    );
  } catch {
    return "severe";
  }
  if (!response.ok) return "severe";

  let parsed: z.infer<typeof chainalysisEntitySchema>;
  try {
    parsed = chainalysisEntitySchema.parse(await response.json());
  } catch {
    return "severe";
  }

  if (parsed.risk === null) return "clean";
  if (NON_SEVERE_TIERS.has(parsed.risk)) return "clean";
  return "severe";
}
