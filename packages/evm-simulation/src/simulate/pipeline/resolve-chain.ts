import { UnsupportedChainError } from "../../errors.js";
import type { ChainSimulationConfig, SimulationConfig } from "../../types.js";

/**
 * Resolve the required `eth_simulateV1` endpoint for a chain.
 * @internal
 * @param config - Per-chain simulation configuration.
 * @param chainId - Chain requested by the caller.
 * @returns The chain's required endpoint.
 * @throws {UnsupportedChainError} When the chain or a nonempty endpoint is absent.
 * @example
 * ```ts
 * import { resolveChain } from "./resolve-chain.js";
 *
 * resolveChain({ chains: new Map([[1, { simulateV1Url: "https://rpc.example" }]]) }, 1);
 * // { simulateV1Url: "https://rpc.example" }
 * ```
 */
export function resolveChain(
  config: SimulationConfig,
  chainId: number,
): ChainSimulationConfig {
  const entry = config.chains.get(chainId);
  if (typeof entry?.simulateV1Url !== "string" || !entry.simulateV1Url.trim()) {
    throw new UnsupportedChainError(chainId);
  }
  return { simulateV1Url: entry.simulateV1Url };
}
