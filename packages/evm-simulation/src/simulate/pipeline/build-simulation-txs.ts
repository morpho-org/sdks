import { getAddress } from "viem";

import type { SimulateParams, SimulationTransaction } from "../../types.js";

import { SimulationValidationError } from "../../errors.js";
import { resolveAuthorizations } from "../authorizations/index.js";

/**
 * Stage 3 of the simulate() pipeline.
 *
 * Prepends any resolved authorizations (e.g. ERC20 `approve` calls generated from
 * `{ type: 'signature' }` entries) to the user's transactions. If no authorizations
 * were supplied, returns the user's transactions unchanged.
 *
 * Defense-in-depth: after prepending, verifies EVERY resolved tx shares the user
 * sender. This catches an `{ type: 'approval', transaction }` auth where the
 * caller-provided `transaction.from` does not match the bundle sender — the
 * `approval` variant otherwise passes through without validation. Rejecting here
 * keeps the "all simulationTxs share one `from`" invariant the downstream
 * backends (eth_simulateV1) assume, and prevents a malicious or buggy caller
 * from prepending a tx on behalf of an unexpected address.
 */
export function buildSimulationTxs(
  params: SimulateParams,
): SimulationTransaction[] {
  const { transactions, authorizations } = params;
  if (!authorizations || authorizations.length === 0) {
    return transactions;
  }

  const sender = transactions[0]!.from;
  const resolved = resolveAuthorizations(authorizations, sender);
  const simulationTxs = [...resolved, ...transactions];

  const senderChecksum = getAddress(sender);
  const mismatches: string[] = [];
  for (let i = 0; i < simulationTxs.length; i++) {
    const tx = simulationTxs[i]!;
    let txFromChecksum: string;
    try {
      txFromChecksum = getAddress(tx.from);
    } catch {
      mismatches.push(
        `simulationTxs[${i}].from: not a valid address (${tx.from})`,
      );
      continue;
    }
    if (txFromChecksum !== senderChecksum) {
      mismatches.push(
        `simulationTxs[${i}].from: expected ${senderChecksum}, got ${txFromChecksum}`,
      );
    }
  }

  if (mismatches.length > 0) {
    throw new SimulationValidationError(
      "Authorization transaction(s) must share the user sender",
      mismatches,
    );
  }

  return simulationTxs;
}
