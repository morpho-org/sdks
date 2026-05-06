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
 * Simulates a bundle of EVM transactions on a configured chain.
 *
 * Pipeline: validates input → resolves authorizations into prepended approve transactions →
 * runs the bundle through Tenderly REST (primary) or `eth_simulateV1` (fallback) within a
 * shared timeout budget → parses ERC-20 / WETH transfers from logs → asserts no funds are
 * retained by `bundler3` → returns the full result set. The caller reads whichever fields they
 * need:
 *
 * - **Preview** (`shareable: true`): `transfers` + `tenderlyUrl`.
 * - **Verify** (default): `simulationTxs` + `transfers`, then pass both to {@link screenAddresses}
 *   for compliance.
 *
 * @param config - Backend configuration: Tenderly credentials, per-chain RPC URLs, optional
 *   logger, and the overall timeout budget.
 * @param params - Per-call simulation input.
 * @param params.chainId - Chain id the bundle targets.
 * @param params.transactions - The bundle's transactions, in execution order. All must share the
 *   same `from`.
 * @param params.authorizations - Optional token authorizations resolved into prepended approve
 *   transactions before the main bundle runs.
 * @param params.blockNumber - Optional pinned block number or `BlockTag`. Defaults to `latest`.
 * @param options - Per-call simulation options.
 * @param options.shareable - When `true`, persists the simulation in Tenderly and returns a
 *   shareable `tenderlyUrl`. Honored only on the Tenderly backend, not on the `eth_simulateV1`
 *   fallback. Defaults to `false`.
 * @returns A `SimulationResult` carrying the resolved `simulationTxs`, parsed `transfers`, the
 *   optional `tenderlyUrl`, and the opaque Tenderly `assetChanges` payload.
 * @throws {SimulationValidationError} when `params` fails input validation.
 * @throws {UnsupportedChainError} when no backend is configured for `chainId`.
 * @throws {SimulationRevertedError} when the bundle reverts on-chain.
 * @throws {BlacklistViolationError} when bundler retention is detected after parsing transfers.
 * @throws {ExternalServiceError} when both backends are unavailable within the timeout budget.
 * @example
 * ```ts
 * import { simulate } from "@morpho-org/evm-simulation";
 *
 * const result = await simulate(
 *   { chains: new Map([[1, { simulateV1Url: rpcUrl }]]) },
 *   {
 *     chainId: 1,
 *     transactions: [{ from: user, to: vaultAddress, data: encodedCalldata, value: 0n }],
 *   },
 * );
 * // result satisfies SimulationResult
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
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
  const transfers = parseTransfers(result.callResults, config.logger);

  assertNoBundlerRetention({
    chainId: params.chainId,
    transfers,
    logger: config.logger,
  });

  return {
    simulationTxs,
    callResults: result.callResults,
    transfers,
    tenderlyUrl: result.tenderlyUrl,
  };
}
