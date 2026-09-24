import {
  _try,
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { ExternalServiceError } from "../errors.js";
import type {
  SimulateParams,
  SimulationConfig,
  SimulationResult,
} from "../types.js";

import { parseTransfers } from "./parsing/index.js";
import {
  assertNoBundlesRetention,
  buildSimulationTxs,
  executeSimulation,
  validateInput,
} from "./pipeline/index.js";

/**
 * Simulate a bundle of EVM transactions.
 *
 * Validates input → resolves authorizations into prepended approve txs → runs the bundle
 * through `eth_simulateV1` with the full timeout budget → parses ERC20 transfers and
 * WETH9 events from per-tx logs, restricting WETH9
 * events to the registered wrapped-native token, rejecting them on known tokenless chains,
 * and retaining signature-based parsing for unknown chains → asserts no funds are retained
 * by standalone `bundles` periphery contracts → returns the full result
 * set. The caller reads whichever fields they need:
 *
 * - `transfers` → user-facing preview / server-side verification.
 * - `simulationTxs` + `transfers` → server-side verification before broadcast.
 * - `calls[i]` → per-tx raw backend output (`logs`, `status`, `returnData`, `gasUsed`).
 *   Aligned 1:1 with `simulationTxs[i]`. `gasUsed` is not a safe gas limit; consumers
 *   deriving one must add their own headroom.
 * - `assetChanges` → net per-asset balance changes grouped by account (sender and
 *   counterparties) over the whole bundle.
 * - `transfers[k].txIdx` → index into `simulationTxs` of the tx that emitted the
 *   underlying log; consumers map back via `simulationTxs[transfer.txIdx]`.
 *
 * @param config - Required per-chain `eth_simulateV1` URL, optional logger, and
 *   the overall timeout budget.
 * @param params - Per-call simulation input.
 * @param params.chainId - Chain id the bundle targets.
 * @param params.transactions - The bundle's transactions, in execution order. All must share the
 *   same `from`.
 * @param params.authorizations - Optional token authorizations resolved into prepended approve
 *   transactions before the main bundle runs.
 * @param params.blockNumber - Optional pinned block number or `BlockTag`. Defaults to `latest`.
 * @throws {SimulationValidationError} for invalid input (mixed senders, bad addresses,
 *   empty transactions, malformed authorizations).
 * @throws {UnsupportedChainError} when the chain has no `eth_simulateV1` endpoint configured.
 * @throws {SimulationRevertedError} when the bundle reverts.
 * @throws {BlacklistViolationError} when the simulation leaves value retained beyond
 *   the dust threshold by a `bundles` periphery contract (VaultExitBundlesV1,
 *   VaultBundlesV1, BlueBundlesV1). Never bypassable.
 * @throws {ExternalServiceError} (a) when the RPC is unavailable within the
 *   timeout budget, or (b) when the backend returns a `calls` array whose length does
 *   not match the resolved `simulationTxs` — refusing to map transfers with mismatched
 *   per-tx output.
 * @returns A {@link SimulationResult} carrying the resolved `simulationTxs`, per-tx
 *   `calls` (aligned 1:1 with `simulationTxs`), parsed `transfers` (each stamped
 *   with `txIdx`), and per-account net `assetChanges`.
 * @example
 * ```ts
 * import { simulate } from "@morpho-org/evm-simulation";
 * import { encodeFunctionData, erc20Abi } from "viem";
 *
 * const user = "0x1111111111111111111111111111111111111111";
 * const recipient = "0x2222222222222222222222222222222222222222";
 * const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
 *
 * const result = await simulate(
 *   {
 *     chains: new Map([
 *       [1, {
 *         simulateV1Url: process.env.MAINNET_RPC_URL!,
 *       }],
 *     ]),
 *   },
 *   {
 *     chainId: 1,
 *     transactions: [{
 *       from: user, to: usdc,
 *       data: encodeFunctionData({
 *         abi: erc20Abi, functionName: "transfer", args: [recipient, 1_000_000n],
 *       }),
 *     }],
 *   },
 * );
 * // result.transfers includes the 1 USDC transfer when the sender is funded.
 * ```
 */
export async function simulate(
  config: SimulationConfig,
  params: SimulateParams,
): Promise<SimulationResult> {
  // Reject invalid input before preparing or executing any calls.
  validateInput(params);

  const wNative = _try(
    () => getChainAddresses(params.chainId).wNative ?? null,
    UnsupportedChainIdError,
  );

  const simulationTxs = buildSimulationTxs(params);
  const result = await executeSimulation({
    config,
    chainId: params.chainId,
    transactions: simulationTxs,
    blockNumber: params.blockNumber,
    wNative,
  });
  if (result.calls.length !== simulationTxs.length) {
    throw new ExternalServiceError(
      `Backend returned ${result.calls.length} call result(s) for ${simulationTxs.length} transaction(s) — refusing to map transfers with mismatched lengths`,
    );
  }

  const transfers = parseTransfers(result.calls, {
    wNative,
    logger: config.logger,
  });

  // Reject retained funds before returning a successful simulation.
  assertNoBundlesRetention({
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
