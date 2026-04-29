import type { SimulationConfig } from "../../types.js";

import { UnsupportedChainError } from "../../errors.js";

interface ChainCapability {
  tenderlySupported: boolean;
  simulateV1Url?: string;
}

/**
 * Stage 2 of the simulate() pipeline.
 *
 * Determines which backend(s) are available for a chainId. Throws
 * `UnsupportedChainError` when neither Tenderly nor `eth_simulateV1` is reachable
 * for the requested chain.
 */
export function resolveChain(
  config: SimulationConfig,
  chainId: number,
): ChainCapability {
  const tenderlySupported =
    config.tenderlyRest?.supportedChainIds.has(chainId) ?? false;
  const simulateV1Url = config.chains.get(chainId)?.simulateV1Url;

  if (!tenderlySupported && !simulateV1Url) {
    throw new UnsupportedChainError(chainId);
  }

  return { tenderlySupported, simulateV1Url };
}
