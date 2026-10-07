import {
  SimulationValidationError,
  UnsupportedChainError,
} from "../../errors.js";
import type { ChainSimulationConfig, SimulationConfig } from "../../types.js";

/**
 * Stage 2 of the simulate() pipeline.
 *
 * Looks up the per-chain `ChainSimulationConfig`. Throws `UnsupportedChainError`
 * when the chain is absent from the map or has no `simulateV1Url` (defensive —
 * the type already requires it at construction). Throws
 * `SimulationValidationError` when `blockOverrides.gasLimit` is set but is
 * not a positive bigint, so a misconfiguration never surfaces as a bypassable
 * `ExternalServiceError`.
 */
export function resolveChain(
  config: SimulationConfig,
  chainId: number,
): ChainSimulationConfig {
  const entry = config.chains.get(chainId);
  if (!entry?.simulateV1Url) throw new UnsupportedChainError(chainId);
  const gasLimit: unknown = entry.blockOverrides?.gasLimit;
  if (
    gasLimit !== undefined &&
    (typeof gasLimit !== "bigint" || gasLimit <= 0n)
  )
    throw new SimulationValidationError(
      `Chain ${chainId} blockOverrides.gasLimit must be a positive bigint`,
      ["blockOverrides.gasLimit"],
    );
  return entry;
}
