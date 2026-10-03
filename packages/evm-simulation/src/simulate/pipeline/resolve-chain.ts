import { UnsupportedChainError } from "../../errors.js";
import type { ChainSimulationConfig, SimulationConfig } from "../../types.js";

/**
 * Stage 2 of the simulate() pipeline.
 *
 * Looks up the per-chain `ChainSimulationConfig`. Throws `UnsupportedChainError`
 * when the chain is absent from the map or has no `simulateV1Url` (defensive —
 * the type already requires it at construction).
 */
export function resolveChain(
  config: SimulationConfig,
  chainId: number,
): ChainSimulationConfig {
  const entry = config.chains.get(chainId);
  if (!entry?.simulateV1Url) throw new UnsupportedChainError(chainId);
  return entry;
}
