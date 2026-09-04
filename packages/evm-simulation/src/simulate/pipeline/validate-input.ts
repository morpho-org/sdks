import { isAddress, zeroAddress } from "viem";
import { SimulationValidationError } from "../../errors.js";
import type { SimulateParams, SimulationTransaction } from "../../types.js";
import { validateAuthorizations } from "../authorizations/index.js";

/**
 * Stage 1 of the simulate() pipeline.
 *
 * Throws `SimulationValidationError` with a `fieldErrors[]` list on any invalid input:
 * empty transactions, malformed / zero-addr fields, missing `data`, negative `value`,
 * bad `chainId`, mixed senders (all txs in a bundle must share the same `from`), or an
 * invalid fee (a zero/negative gas price, a priority fee above the max fee, or mixing
 * the legacy and EIP-1559 forms). Also runs `validateAuthorizations`.
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

  // Fee validation, in one pass over every transaction whose fee fields reach a
  // backend: the caller's transactions plus any `approval` authorization
  // transaction, which resolveAuthorizations prepends to the bundle as-is. Both
  // share these checks so an invalid fee fails here as SimulationValidationError,
  // not later as a bypassable ExternalServiceError. A zero (or negative)
  // effective gas price never occurs on-chain and would re-open the Cantina 1631
  // skipRevert gap; a zero `maxPriorityFeePerGas` tip is fine.
  const feeTargets: { tx: SimulationTransaction; label: string }[] =
    transactions.map((tx, i) => ({ tx, label: `transactions[${i}]` }));
  params.authorizations?.forEach((auth, i) => {
    if (auth.type === "approval") {
      feeTargets.push({
        tx: auth.transaction,
        label: `authorizations[${i}].transaction`,
      });
    }
  });

  for (const { tx, label } of feeTargets) {
    const { gasPrice, maxFeePerGas, maxPriorityFeePerGas } = tx;
    if (gasPrice !== undefined && gasPrice <= 0n) {
      errors.push(`${label}.gasPrice: must be a positive gas price`);
    }
    if (maxFeePerGas !== undefined && maxFeePerGas <= 0n) {
      errors.push(`${label}.maxFeePerGas: must be a positive gas price`);
    }
    if (maxPriorityFeePerGas !== undefined && maxPriorityFeePerGas < 0n) {
      errors.push(`${label}.maxPriorityFeePerGas: must be non-negative`);
    }
    if (
      gasPrice !== undefined &&
      (maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined)
    ) {
      errors.push(
        `${label}: set either gasPrice (legacy) or maxFeePerGas/maxPriorityFeePerGas (EIP-1559), not both`,
      );
    }
    if (
      maxFeePerGas !== undefined &&
      maxPriorityFeePerGas !== undefined &&
      maxPriorityFeePerGas > maxFeePerGas
    ) {
      errors.push(
        `${label}: maxPriorityFeePerGas must not exceed maxFeePerGas`,
      );
    }
  }

  if (errors.length > 0) {
    throw new SimulationValidationError("Invalid simulation input", errors);
  }
}
