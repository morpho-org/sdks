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
 * not a positive bigint, or `parentHashCheck` is set but is not a boolean, so a
 * misconfiguration never surfaces as a bypassable
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
      `Chain ${chainId} blockOverrides.gasLimit must be a positive bigint, got "${String(gasLimit)}" (${typeof gasLimit}). Pass a bigint greater than 0n or omit gasLimit.`,
      ["blockOverrides.gasLimit"],
    );
  const parentHashCheck: unknown = entry.parentHashCheck;
  if (parentHashCheck !== undefined && typeof parentHashCheck !== "boolean")
    throw new SimulationValidationError(
      `Chain ${chainId} parentHashCheck must be a boolean, got "${String(parentHashCheck)}" (${typeof parentHashCheck}). Pass true or false, or omit parentHashCheck.`,
      ["parentHashCheck"],
    );
  return entry;
}
