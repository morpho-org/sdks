import type { BlockTag } from "viem";
import type { SimulationConfig } from "../../types.js";
import { executePlan } from "../backends/index.js";
import type { SimulationExecution } from "../backends/parse-response.js";
import type { ExecutionPlan } from "../plan/plan-execution.js";
import { resolveChain } from "./resolve-chain.js";

/** Total execution budget for a single `simulate()` call. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Execute the plan once through `eth_simulateV1` within the full timeout budget.
 * The single `AbortSignal.timeout` is shared by the boundary's chain check,
 * block resolution, and simulation request.
 * @internal
 * @param params - Configuration, the planned execution, and the resolved block pin.
 * @returns The executed transactions and the pinned block.
 * @throws {UnsupportedChainError} When the chain has no simulation endpoint.
 * @throws {ExternalServiceError} When the RPC fails or times out.
 * @throws {SimulationRevertedError} When execution reverts.
 * @example
 * ```ts
 * import { executeSimulation } from "./execute-simulation.js";
 *
 * await executeSimulation({ config, plan, blockNumber: 20_000_000n });
 * ```
 */
export async function executeSimulation(params: {
  readonly config: SimulationConfig;
  readonly plan: ExecutionPlan;
  readonly blockNumber?: bigint | BlockTag;
}): Promise<SimulationExecution> {
  const { config, plan, blockNumber } = params;
  const chain = resolveChain(config, plan.request.chainId);

  // Backend output is trusted as execution evidence; shape checks cannot catch a well-formed forged result. See THREAT_MODEL.md, RPC.
  return executePlan({
    rpcUrl: chain.simulateV1Url,
    plan,
    blockNumber,
    signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
}
