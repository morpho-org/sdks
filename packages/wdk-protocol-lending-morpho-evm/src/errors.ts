/**
 * Thrown when a prepared Morpho transaction plan does not produce its primary call.
 *
 * @example
 * ```ts
 * import { MissingTransactionPlanCallError } from "@morpho-org/wdk-protocol-lending-morpho-evm";
 *
 * if (error instanceof MissingTransactionPlanCallError) {
 *   // Recreate the plan from current protocol state before retrying.
 * }
 * ```
 */
export class MissingTransactionPlanCallError extends Error {
  constructor() {
    super(
      "Transaction plan produced no executable primary call. Recreate the plan before retrying.",
    );
    this.name = "MissingTransactionPlanCallError";
  }
}
