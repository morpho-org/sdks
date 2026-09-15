import type { SimulationTransaction } from "../types.js";

/**
 * Default gas price, in wei (1 gwei), applied to a {@link SimulationTransaction}
 * that carries no explicit fee field.
 *
 * Simulation must never execute at `tx.gasprice == 0`: that value never occurs
 * on-chain, and a step that reverts *only* under a positive fee context — e.g.
 * an external route whose settlement nets out gas cost and then fails its own
 * min-out — would silently succeed in the preview. If such a step is
 * `skipRevert: true`, Bundler3 skips it on-chain and funds routed to `bundler3`
 * by earlier steps are stranded, while the retention guard, run on the zero-fee
 * preview, sees nothing retained (Cantina finding 1631).
 *
 * A non-zero default makes the guard evaluate a *possible* execution. Callers
 * that know the transaction's real effective gas price should pass it (via
 * `gasPrice`, or `maxFeePerGas` / `maxPriorityFeePerGas`) for an exact preview;
 * the default is only the fallback. The value is deliberately realistic rather
 * than extreme — over-estimating fees can only make the guard reject more, never
 * strand, but an extreme default would spuriously reject legitimate bundles.
 */
export const DEFAULT_SIMULATION_GAS_PRICE = 1_000000000n;

/**
 * Fee fields a backend serializes for a single simulated call. Only the keys
 * that apply are set: legacy (`gasPrice`) or EIP-1559
 * (`maxFeePerGas` / `maxPriorityFeePerGas`), never both.
 *
 * @internal
 */
export interface ResolvedFeeContext {
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

/**
 * Resolve the fee context a backend serializes for `tx`.
 *
 * Honors an explicit legacy (`gasPrice`) or EIP-1559
 * (`maxFeePerGas` / `maxPriorityFeePerGas`) fee. When the caller sets none,
 * falls back to {@link DEFAULT_SIMULATION_GAS_PRICE} so the call never executes
 * at a zero — impossible on-chain — gas price that would hide a fee-sensitive
 * revert (Cantina finding 1631). Input validation enforces upstream that any
 * explicit fee is positive (a zero gas price is rejected, not honored) and that
 * the legacy and EIP-1559 forms are not mixed, so this only shapes valid input.
 *
 * @param tx - The transaction whose fee fields to resolve.
 * @returns The fee fields to forward to the backend; unset fields are omitted.
 * @internal
 */
export function resolveFeeContext(
  tx: SimulationTransaction,
): ResolvedFeeContext {
  const { gasPrice, maxFeePerGas, maxPriorityFeePerGas } = tx;
  if (
    gasPrice === undefined &&
    maxFeePerGas === undefined &&
    maxPriorityFeePerGas === undefined
  ) {
    return { gasPrice: DEFAULT_SIMULATION_GAS_PRICE };
  }
  return { gasPrice, maxFeePerGas, maxPriorityFeePerGas };
}
