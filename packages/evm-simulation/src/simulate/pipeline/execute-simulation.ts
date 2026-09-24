import type { Address, BlockTag } from "viem";
import type {
  RawSimulationResult,
  SimulationConfig,
  SimulationTransaction,
} from "../../types.js";
import { simulateV1 } from "../backends/index.js";
import { resolveChain } from "./resolve-chain.js";

/** Default budget for the single `eth_simulateV1` request. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Stage 4 of the simulate() pipeline.
 *
 * Runs the bundle once through `eth_simulateV1` with the full `timeoutMs`
 * budget. Every failure — RPC error, timeout, or `SimulationRevertedError` —
 * propagates as-is; there is no second provider and no retry.
 */
export async function executeSimulation(params: {
  config: SimulationConfig;
  chainId: number;
  transactions: SimulationTransaction[];
  blockNumber?: bigint | BlockTag;
  wNative?: Address | null;
}): Promise<RawSimulationResult> {
  const { config, chainId, transactions, blockNumber, wNative } = params;
  const { simulateV1Url } = resolveChain(config, chainId);

  return await simulateV1({
    rpcUrl: simulateV1Url,
    chainId,
    transactions,
    blockNumber,
    wNative,
    signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
}
