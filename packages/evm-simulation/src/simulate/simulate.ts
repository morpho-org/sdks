import type { SimulateParams } from "../domain/request.js";
import type { VerifiedSimulationResult } from "../domain/result.js";
import type { SimulationConfig } from "../types.js";
import { runPipeline } from "./pipeline/run-pipeline.js";
import { parseRequest } from "./request/index.js";

/**
 * Simulate a bundle of EVM transactions.
 *
 * Parses and normalizes the input → plans the execution as ordered user calls
 * interleaved with synthetic native-balance probes → resolves the chain
 * endpoint → executes once through `eth_simulateV1` under the full timeout
 * budget (chain identity check, single block resolution, pinned simulation) →
 * derives ERC20/WETH9 transfers and net asset changes from the user calls only
 * → asserts no funds are retained by standalone `bundles` periphery contracts →
 * returns the result. The caller reads whichever fields they need:
 *
 * - `simulationTxs` → exactly the caller's ordered transactions, normalized
 *   (checksummed addresses, `value` defaulted to `0n`). Internal probes are
 *   never exposed.
 * - `calls[i]` → per-tx raw backend output (`logs`, `status`, `returnData`,
 *   `gasUsed`), aligned 1:1 with `simulationTxs[i]`. `gasUsed` is not a safe
 *   gas limit; consumers deriving one must add their own headroom.
 * - `transfers` → user-facing preview / server-side verification; each
 *   transfer's `txIdx` indexes into `simulationTxs`.
 * - `assetChanges` → net per-asset balance changes grouped by account (sender
 *   and counterparties) over the whole bundle.
 *
 * **Modes.** `mode` defaults to `"final"`, which executes the signed calldata
 * against actual permissions and accepts no `authorizations`. `mode:
 * "preview"` accepts typed authorization descriptors, which the pipeline
 * prepares as simulated approval calls and verifies via in-block read-back
 * probes. `limits` are enforced as post-verification consumer constraints;
 * violations throw `ConsumerLimitViolationError`.
 *
 * **Funding.** `value` transfers are funded by the sender's real native
 * balance — no balance inflation — so under-funded bundles revert exactly as
 * they would on-chain. `validation: false` keeps gas from being charged,
 * separating gas from economic effects.
 *
 * @param config - Required per-chain `eth_simulateV1` URL, optional logger, and
 *   the overall timeout budget.
 * @param params - Per-call simulation input.
 * @param params.chainId - Chain id the bundle targets; must match the endpoint.
 * @param params.transactions - The bundle's transactions, in execution order.
 *   All must share the same `from`.
 * @param params.mode - `"final"` (default) or `"preview"`.
 * @param params.authorizations - Preview-only typed authorization descriptors.
 * @param params.limits - Optional consumer constraints (tightening only).
 * @param params.blockNumber - Optional pinned block number or `BlockTag`.
 *   Defaults to `latest`, resolved exactly once.
 * @throws {SimulationValidationError} for invalid input (mixed senders, bad
 *   addresses, empty transactions, malformed authorizations, final-mode
 *   authorizations, weakening limits).
 * @throws {ConsumerLimitViolationError} when a declared `limits` bound is
 *   violated by the verified effects.
 * @throws {UnsupportedChainError} when the chain has no `eth_simulateV1`
 *   endpoint configured.
 * @throws {SimulationRevertedError} when a user transaction reverts.
 * @throws {MissingVerificationEvidenceError} when a probe fails or its data
 *   cannot be decoded.
 * @throws {InvalidSimulationResponseError} when the node response cannot be
 *   trusted (bad shape, call-count mismatch, block behind the pinned state,
 *   or a state-block hash that changed mid-flight).
 * @throws {BlacklistViolationError} when the simulation leaves value retained
 *   beyond the dust threshold by a `bundles` periphery contract
 *   (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1). Never bypassable.
 * @throws {ExternalServiceError} when the RPC is unavailable within the
 *   timeout budget or reports a different chain.
 * @returns A frozen {@link SimulationResult} carrying the normalized
 *   `simulationTxs`, per-tx `calls` (aligned 1:1), parsed `transfers` (each
 *   stamped with `txIdx`), and per-account net `assetChanges`.
 * @example
 * ```ts
 * import { simulate } from "@morpho-org/evm-simulation";
 * import { encodeFunctionData, erc20Abi } from "viem";
 *
 * const result = await simulate(
 *   { chains: new Map([[1, { simulateV1Url: rpcUrl }]]) },
 *   {
 *     chainId: 1,
 *     transactions: [
 *       {
 *         from: user,
 *         to: usdc,
 *         data: encodeFunctionData({
 *           abi: erc20Abi,
 *           functionName: "transfer",
 *           args: [recipient, 1_000_000n],
 *         }),
 *       },
 *     ],
 *   },
 * );
 * ```
 */
export async function simulate(
  config: SimulationConfig,
  params: SimulateParams,
): Promise<VerifiedSimulationResult> {
  return runPipeline({ config, request: parseRequest(params) });
}
