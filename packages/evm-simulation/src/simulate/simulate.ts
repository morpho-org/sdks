import { ExternalServiceError } from "../errors.js";
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
 * budget → parses ERC20/WETH transfers from per-tx logs → asserts no funds are retained
 * by `bundler3` → returns the full result set. The caller reads whichever fields they need:
 *
 * - `transfers` + `tenderlyUrl` → user-facing preview.
 * - `simulationTxs` + `transfers` → server-side verification before broadcast, then pass
 *   both to `screenAddresses` for compliance.
 * - `calls[i]` → per-tx raw backend output (`logs`, `status`, `returnData`, `gasUsed`,
 *   and Tenderly-only `assetChanges`). Aligned 1:1 with `simulationTxs[i]`.
 * - `transfers[k].txIdx` → index into `simulationTxs` of the tx that emitted the
 *   underlying log; consumers map back via `simulationTxs[transfer.txIdx]`.
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
 * @throws {SimulationValidationError} for invalid input (mixed senders, bad addresses,
 *   empty transactions, malformed authorizations).
 * @throws {UnsupportedChainError} when the chain is not configured for any backend.
 * @throws {SimulationRevertedError} when the bundle reverts on either backend.
 * @throws {BlacklistViolationError} when the simulation leaves value retained by or
 *   drained from a `bundler3` address beyond the dust threshold.
 * @throws {ExternalServiceError} (a) when both backends are unavailable within the
 *   timeout budget, or (b) when a backend returns a `calls` array whose length does
 *   not match the resolved `simulationTxs` — refusing to map transfers with mismatched
 *   per-tx output.
 * @returns A {@link SimulationResult} carrying the resolved `simulationTxs`, per-tx
 *   `calls` (aligned 1:1 with `simulationTxs`), parsed `transfers` (each stamped with
 *   `txIdx`), and the optional `tenderlyUrl`.
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
  if (result.calls.length !== simulationTxs.length) {
    throw new ExternalServiceError(
      `Backend returned ${result.calls.length} call result(s) for ${simulationTxs.length} transaction(s) — refusing to map transfers with mismatched lengths`,
    );
  }

  const transfers = parseTransfers(result.calls, config.logger);

  assertNoBundlerRetention({
    chainId: params.chainId,
    transfers,
    logger: config.logger,
  });

  return {
    simulationTxs,
    calls: result.calls,
    transfers,
    tenderlyUrl: result.tenderlyUrl,
  };
}
