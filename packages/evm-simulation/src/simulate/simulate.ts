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
 * through Tenderly RPC (primary) or `eth_simulateV1` (fallback) with a shared timeout
 * budget → parses ERC20/WETH transfers from per-tx logs → asserts no funds are retained
 * by `bundler3` → returns the full result set. The caller reads whichever fields they need:
 *
 * - `transfers` → user-facing preview / server-side verification.
 * - `simulationTxs` + `transfers` → server-side verification before broadcast.
 * - `calls[i]` → per-tx raw backend output (`logs`, `status`, `returnData`, `gasUsed`,
 *   and Tenderly-only `assetChanges`). Aligned 1:1 with `simulationTxs[i]`.
 * - `transfers[k].txIdx` → index into `simulationTxs` of the tx that emitted the
 *   underlying log; consumers map back via `simulationTxs[transfer.txIdx]`.
 *
 * @param config - Backend configuration: per-chain Tenderly RPC and/or `eth_simulateV1`
 *   URL, optional logger, and the overall timeout budget.
 * @param params - Per-call simulation input.
 * @param params.chainId - Chain id the bundle targets.
 * @param params.transactions - The bundle's transactions, in execution order. All must share the
 *   same `from`.
 * @param params.authorizations - Optional token authorizations resolved into prepended approve
 *   transactions before the main bundle runs.
 * @param params.blockNumber - Optional pinned block number or `BlockTag`. Defaults to `latest`.
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
 *   `calls` (aligned 1:1 with `simulationTxs`), and parsed `transfers` (each stamped
 *   with `txIdx`).
 * @example
 * ```ts
 * import { simulate } from "@morpho-org/evm-simulation";
 *
 * const result = await simulate(
 *   {
 *     chains: new Map([
 *       [1, {
 *         tenderlyRpc: { rpcUrl: process.env.TENDERLY_RPC_URL! },
 *         simulateV1Url: process.env.MAINNET_RPC_URL,
 *       }],
 *     ]),
 *   },
 *   {
 *     chainId: 1,
 *     transactions: [{ from: user, to: vaultAddress, data: encodedCalldata, value: 0n }],
 *   },
 * );
 * // result satisfies SimulationResult
 * ```
 */
export async function simulate(
  config: SimulationConfig,
  params: SimulateParams,
): Promise<SimulationResult> {
  validateInput(params);

  const simulationTxs = buildSimulationTxs(params);
  const result = await executeSimulation({
    config,
    chainId: params.chainId,
    transactions: simulationTxs,
    blockNumber: params.blockNumber,
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
  };
}
