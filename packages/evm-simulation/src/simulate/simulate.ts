import type {
  SimulateParams,
  SimulationConfig,
  SimulationResult,
} from "../types.js";

import { parseTransfers } from "./parsing/index.js";
import {
  assertNoBundlerRetention,
  buildSimulationTxs,
  executeSimulation,
  validateInput,
} from "./pipeline/index.js";

/**
 * Simulate a bundle of EVM transactions.
 *
 * Validates input → resolves authorizations into prepended approve txs → runs the bundle
 * through Tenderly REST (primary) or `eth_simulateV1` (fallback) with a shared timeout
 * budget → parses ERC20/WETH transfers from logs → asserts no funds are retained by
 * `bundler3` → returns the full result set. The caller reads whichever fields they need:
 *
 * - `transfers` + `tenderlyUrl` → user-facing preview.
 * - `simulationTxs` + `transfers` → server-side verification before broadcast, then pass
 *   both to `screenAddresses` for compliance.
 *
 * Throws `SimulationValidationError` for bad input, `UnsupportedChainError` when the chain
 * is not configured, `SimulationRevertedError` if the bundle reverts,
 * `BlacklistViolationError` if bundler retention is detected, or `ExternalServiceError` if
 * both backends are unavailable within the timeout budget.
 */
export async function simulate(
  config: SimulationConfig,
  params: SimulateParams,
  options: {
    /**
     * When true, persist the simulation in Tenderly and return a shareable
     * `tenderlyUrl` in the result. Only honored when the Tenderly backend runs
     * (not the `eth_simulateV1` fallback). Defaults to `false`.
     */
    shareable?: boolean;
  } = {},
): Promise<SimulationResult> {
  const { shareable = false } = options;

  validateInput(params);

  const simulationTxs = buildSimulationTxs(params);
  const result = await executeSimulation({
    config,
    chainId: params.chainId,
    transactions: simulationTxs,
    blockNumber: params.blockNumber,
    shareable,
  });
  const transfers = parseTransfers(result.logs, config.logger);

  assertNoBundlerRetention({
    chainId: params.chainId,
    transfers,
    logger: config.logger,
  });

  return {
    simulationTxs,
    transfers,
    tenderlyUrl: result.tenderlyUrl,
    assetChanges: result.rawAssetChanges,
  };
}
