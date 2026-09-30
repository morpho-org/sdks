import { UnsupportedChainError } from "../../errors.js";
import type { SimulationConfig, TenderlyRpcConfig } from "../../types.js";

interface ChainCapability {
  tenderlyRpc?: TenderlyRpcConfig;
  simulateV1Url?: string;
}

/**
 * Stage 2 of the simulate() pipeline.
 *
 * Looks up the per-chain `ChainSimulationConfig` and exposes whichever
 * backends were configured. Throws `UnsupportedChainError` when the chain is
 * absent from the map or has neither backend wired (defensive — the type
 * already enforces at least one at construction).
 */
export function resolveChain(
  config: SimulationConfig,
  chainId: number,
): ChainCapability {
  const entry = config.chains.get(chainId);
  if (!entry || (!entry.tenderlyRpc && !entry.simulateV1Url)) {
    throw new UnsupportedChainError(chainId);
  }
  return {
    tenderlyRpc: entry.tenderlyRpc,
    simulateV1Url: entry.simulateV1Url,
  };
}
