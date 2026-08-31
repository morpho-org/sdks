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
 * - `calls[i]` → per-tx raw backend output (`logs`, `status`, `returnData`, `gasUsed`).
 *   Aligned 1:1 with `simulationTxs[i]`. `gasUsed` is not a safe gas limit; consumers
 *   deriving one must add their own headroom.
 * - `assetChanges` → net per-asset balance changes grouped by account (sender and
 *   counterparties) over the whole bundle, normalized to the same shape across backends.
 * - `transfers[k].txIdx` → index into `simulationTxs` of the tx that emitted the
 *   underlying log; consumers map back via `simulationTxs[transfer.txIdx]`.
 *
 * @remarks
 * **Simulation fidelity — gas cost & sender balance.** Every backend runs the
 * bundle with the sender's native balance overridden to `maxUint256 / 2` and
 * with no gas price (`SimulationTransaction` cannot express one). This
 * deliberately suppresses false "insufficient funds for gas" reverts, but it
 * also means the simulation cannot observe a step that reverts on-chain *only
 * because* the caller's real, post-gas native balance is too low. If such a
 * step is encoded with `skipRevert: true`, Bundler3 continues past it on-chain
 * and any funds routed to a `bundler3` address by earlier steps are stranded —
 * a case the retention guard behind `BlacklistViolationError` cannot
 * flag, because the step succeeds in simulation (Cantina finding 1631). The
 * Morpho builders avoid this by keeping every native/value-carrying step
 * `skipRevert: false` so the bundle reverts atomically; integrators composing
 * raw bundles must uphold the same invariant, and may additionally reserve
 * on-chain native value for gas.
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
 * @throws {BlacklistViolationError} when the simulation leaves value retained by
 *   a `bundler3` address beyond the dust threshold.
 * @throws {ExternalServiceError} (a) when both backends are unavailable within the
 *   timeout budget, or (b) when a backend returns a `calls` array whose length does
 *   not match the resolved `simulationTxs` — refusing to map transfers with mismatched
 *   per-tx output.
 * @returns A {@link SimulationResult} carrying the resolved `simulationTxs`, per-tx
 *   `calls` (aligned 1:1 with `simulationTxs`), parsed `transfers` (each stamped
 *   with `txIdx`), and per-account net `assetChanges`.
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
    assetChanges: result.assetChanges,
    logger: config.logger,
  });

  return {
    simulationTxs,
    calls: result.calls,
    transfers,
    assetChanges: result.assetChanges,
  };
}
