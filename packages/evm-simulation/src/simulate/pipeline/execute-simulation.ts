import type { BlockTag } from "viem";

import type {
  RawSimulationResult,
  SimulationConfig,
  SimulationTransaction,
} from "../../types.js";

import { ExternalServiceError, UnsupportedChainError } from "../../errors.js";
import { simulateTenderlyRest, simulateV1 } from "../backends/index.js";
import { resolveChain } from "./resolve-chain.js";

/** Total budget for a single `simulate()` call across both backends. */
const DEFAULT_TIMEOUT_MS = 5000;

/** Fraction of `timeoutMs` given to Tenderly before falling back to `eth_simulateV1`. */
const TENDERLY_BUDGET_RATIO = 0.6;

/**
 * Minimum budget (ms) handed to the `eth_simulateV1` fallback when Tenderly fails.
 *
 * Without a floor, if Tenderly exhausts its slice and dies at the deadline, the
 * fallback would get ~0 ms and abort immediately — turning a degraded-Tenderly
 * scenario into a total outage even when the fallback backend is healthy. A
 * modest floor keeps the fallback viable at the cost of the overall
 * `timeoutMs` being treated as a soft ceiling.
 */
const FALLBACK_MIN_BUDGET_MS = 1500;

/**
 * Stage 4 of the simulate() pipeline.
 *
 * Dispatches the transaction bundle to the available backend with a shared timeout
 * budget:
 * - If Tenderly is configured for the chain, it gets `TENDERLY_BUDGET_RATIO` (60%) of
 *   the timeout. On `ExternalServiceError`, falls back to `eth_simulateV1` with
 *   `max(remaining, FALLBACK_MIN_BUDGET_MS)` so the fallback still has a viable
 *   window when Tenderly eats its full slice. `SimulationRevertedError` (contract
 *   revert) propagates immediately without retry — a revert is a property of the
 *   bundle, not the backend.
 * - If only `eth_simulateV1` is configured, it gets the full timeout.
 *
 * `shareable` is Tenderly-only: when true, the backend persists the simulation and
 * returns a shareable URL. `eth_simulateV1` ignores it (no persistence concept).
 */
export async function executeSimulation(params: {
  config: SimulationConfig;
  chainId: number;
  transactions: SimulationTransaction[];
  blockNumber?: bigint | BlockTag;
  shareable: boolean;
}): Promise<RawSimulationResult> {
  const { config, chainId, transactions, blockNumber, shareable } = params;
  const chain = resolveChain(config, chainId);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  if (chain.tenderlySupported && config.tenderlyRest) {
    const tenderlyTimeout = Math.floor(timeoutMs * TENDERLY_BUDGET_RATIO);

    try {
      return await simulateTenderlyRest({
        config: config.tenderlyRest,
        chainId,
        transactions,
        blockNumber,
        shareable,
        signal: AbortSignal.timeout(tenderlyTimeout),
        logger: config.logger,
      });
    } catch (error) {
      if (!(error instanceof ExternalServiceError)) throw error;

      config.logger?.warn("Tenderly simulation failed, attempting fallback", {
        chainId,
        error: error.message,
        cause: error.cause,
      });

      if (!chain.simulateV1Url) throw error;

      // Give the fallback a reasonable minimum even if Tenderly consumed the
      // whole budget — otherwise slow-Tenderly == total outage.
      const fallbackBudget = Math.max(
        deadline - Date.now(),
        FALLBACK_MIN_BUDGET_MS,
      );

      return await simulateV1({
        rpcUrl: chain.simulateV1Url,
        chainId,
        transactions,
        blockNumber,
        signal: AbortSignal.timeout(fallbackBudget),
      });
    }
  }

  if (!chain.simulateV1Url) {
    throw new UnsupportedChainError(chainId);
  }

  return await simulateV1({
    rpcUrl: chain.simulateV1Url,
    chainId,
    transactions,
    blockNumber,
    signal: AbortSignal.timeout(timeoutMs),
  });
}
