import { isAddress, zeroAddress } from "viem";

import type { SimulateParams } from "../../types.js";

import { SimulationValidationError } from "../../errors.js";
import { validateAuthorizations } from "../authorizations/index.js";

/**
 * Stage 1 of the simulate() pipeline.
 *
 * Throws `SimulationValidationError` with a `fieldErrors[]` list on any invalid input:
 * empty transactions, malformed / zero-addr fields, missing `data`, negative `value`,
 * bad `chainId`, or mixed senders (all txs in a bundle must share the same `from`).
 * Also runs `validateAuthorizations` on the optional authorizations array.
 */
export function validateInput(params: SimulateParams): void {
  const errors: string[] = [];

  if (!Number.isInteger(params.chainId) || params.chainId <= 0) {
    errors.push(`chainId: must be a positive integer (got ${params.chainId})`);
  }

  const transactions = params.transactions ?? [];
  if (transactions.length === 0) {
    errors.push("transactions: must contain at least 1 transaction");
  }

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i]!;
    if (!tx.from || !isAddress(tx.from) || tx.from === zeroAddress) {
      errors.push(`transactions[${i}].from: must be a valid non-zero address`);
    }
    if (!tx.to || !isAddress(tx.to) || tx.to === zeroAddress) {
      errors.push(`transactions[${i}].to: must be a valid non-zero address`);
    }
    if (!tx.data) {
      errors.push(`transactions[${i}].data: must be provided`);
    }
    if (tx.value !== undefined && tx.value < 0n) {
      errors.push(`transactions[${i}].value: must be non-negative`);
    }
  }

  // Same-sender check uses RAW `.from` strings (lowercased) so the invariant
  // fires even when some tx `from`s are malformed — individual txs already
  // flagged above, but we still want one loud signal that the bundle's
  // senders don't match.
  if (transactions.length > 1) {
    const distinct = new Set(
      transactions.map((tx) => (tx.from ?? "").toLowerCase()),
    );
    if (distinct.size > 1) {
      errors.push(
        "transactions: all transactions must share the same from address",
      );
    }
  }

  if (params.authorizations) {
    errors.push(...validateAuthorizations(params.authorizations));
  }

  if (errors.length > 0) {
    throw new SimulationValidationError("Invalid simulation input", errors);
  }
}
