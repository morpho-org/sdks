import { isAddress, zeroAddress } from "viem";
import { SimulationValidationError } from "../../errors.js";
import type { SimulateParams, SimulationTransaction } from "../../types.js";
import { validateAuthorizations } from "../authorizations/index.js";

/**
 * Fee-field errors for a single simulated transaction. Extracted (despite two
 * call sites) so caller transactions and prepended `approval` authorization
 * transactions — which carry the same fee fields and both reach the backend —
 * validate against one source of truth.
 *
 * Rejects a zero (or negative) effective gas price: that value never occurs
 * on-chain and would re-open the Cantina 1631 `skipRevert` gap. A legacy
 * `gasPrice` or an EIP-1559 `maxFeePerGas` must be positive; a `maxPriorityFeePerGas`
 * tip may be zero but not negative, and not above `maxFeePerGas`. Also rejects
 * mixing the legacy and EIP-1559 forms.
 */
function collectFeeErrors(tx: SimulationTransaction, label: string): string[] {
  const errors: string[] = [];
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
  // Legacy and EIP-1559 fee models are mutually exclusive; a backend serializes
  // only one. Reject both so the fee context stays unambiguous.
  if (
    gasPrice !== undefined &&
    (maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined)
  ) {
    errors.push(
      `${label}: set either gasPrice (legacy) or maxFeePerGas/maxPriorityFeePerGas (EIP-1559), not both`,
    );
  }
  // A priority fee above the max fee is unsubmittable; reject it here so it
  // surfaces as SimulationValidationError, not a backend ExternalServiceError.
  if (
    maxFeePerGas !== undefined &&
    maxPriorityFeePerGas !== undefined &&
    maxPriorityFeePerGas > maxFeePerGas
  ) {
    errors.push(`${label}: maxPriorityFeePerGas must not exceed maxFeePerGas`);
  }
  return errors;
}

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
    errors.push(...collectFeeErrors(tx, `transactions[${i}]`));
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
    // An `approval` authorization embeds a caller-supplied transaction that
    // resolveAuthorizations prepends to the bundle as-is, so its fee fields
    // reach the backend and must pass the same fee checks as params.transactions.
    for (let i = 0; i < params.authorizations.length; i++) {
      const auth = params.authorizations[i]!;
      if (auth.type === "approval") {
        errors.push(
          ...collectFeeErrors(
            auth.transaction,
            `authorizations[${i}].transaction`,
          ),
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new SimulationValidationError("Invalid simulation input", errors);
  }
}
