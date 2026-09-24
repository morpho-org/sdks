import type { Address, BlockTag } from "viem";
import type {
  RawSimulationResult,
  SimulationConfig,
  SimulationTransaction,
} from "../../types.js";
import { simulateV1 } from "../backends/index.js";
import { resolveChain } from "./resolve-chain.js";

/** Total execution budget for a single `simulate()` call. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Execute the bundle once through `eth_simulateV1` within the full timeout budget.
 * @internal
 * @param params - Configuration, target chain, ordered calls, and optional block/native token.
 * @returns Normalized calls and net asset changes.
 * @throws {UnsupportedChainError} When the chain has no simulation endpoint.
 * @throws {SimulationValidationError} When calls are empty or have mixed senders.
 * @throws {ExternalServiceError} When the RPC fails or times out.
 * @throws {SimulationRevertedError} When execution reverts.
 * @example
 * ```ts
 * import { executeSimulation } from "./execute-simulation.js";
 *
 * await executeSimulation({
 *   config: { chains: new Map([[1, { simulateV1Url: "https://rpc.example" }]]) },
 *   chainId: 1,
 *   transactions: [{
 *     from: "0x1111111111111111111111111111111111111111",
 *     to: "0x2222222222222222222222222222222222222222", data: "0x", value: 1n,
 *   }],
 * });
 * // { calls, assetChanges }
 * ```
 */
export async function executeSimulation(params: {
  readonly config: SimulationConfig;
  readonly chainId: number;
  readonly transactions: SimulationTransaction[];
  readonly blockNumber?: bigint | BlockTag;
  readonly wNative?: Address | null;
}): Promise<RawSimulationResult> {
  const { config, chainId, transactions, blockNumber, wNative } = params;
  const chain = resolveChain(config, chainId);

  return simulateV1({
    rpcUrl: chain.simulateV1Url,
    chainId,
    transactions,
    blockNumber,
    wNative,
    signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
}
