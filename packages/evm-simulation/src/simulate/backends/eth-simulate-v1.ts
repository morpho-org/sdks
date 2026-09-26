import { ExecutionRevertedError, numberToHex } from "viem";
import type { ExecutionEvidence, ExecutionPlan } from "../../domain/stages.js";
import {
  ExternalServiceError,
  InvalidSimulationResponseError,
  SimulationPackageError,
  SimulationRevertedError,
} from "../../errors.js";
import { createSimulationClient } from "./client.js";
import { parseSimulationResponse } from "./parse-response.js";
import type { PinnedBlock } from "./resolve-pinned-block.js";

/**
 * Execute an {@link ExecutionPlan} through a single `eth_simulateV1` call and
 * collect pinned evidence.
 *
 * The boundary performs three steps under one shared abort/timeout budget:
 *
 * 1. **Chain identity** — `eth_chainId` must equal the request's `chainId`; a
 *    mismatch is an endpoint-configuration failure (`ExternalServiceError`),
 *    not a simulation failure.
 * 2. **Pinned block + reorg check** — the state block was already resolved
 *    once up front (`resolvePinnedBlock`) so `latest` cannot drift; the
 *    simulation below pins that number and the state block is re-fetched
 *    after the simulation to detect a reorg that swapped its hash mid-flight.
 * 3. **`eth_simulateV1`** — one `blockStateCalls` entry carrying the planned
 *    calls with their per-call `from` (probes are sent from the zero address),
 *    the probe code override as `stateOverrides`, `traceTransfers: true` so
 *    the node synthesizes native-ETH moves as transfer logs, and
 *    `validation: false`. Validation-off means gas is not charged, which is
 *    how gas is separated from economic effects. **No balance override is
 *    applied** — `value` transfers are funded by the sender's real native
 *    balance.
 *
 * Block advancement is observed, not required: geth-style nodes report the
 * simulated block as `stateBlockNumber + 1` while Anvil reports the pinned
 * block itself. The evidence records whatever the node returns; consumers
 * must read {@link ExecutionContext.blockNumber} and never assume +1.
 *
 * The endpoint must support `eth_simulateV1` with `stateOverrides` code
 * injection and per-call `from`; there is no fallback backend.
 *
 * @param params - RPC endpoint, the plan to execute, the already-resolved
 *   pinned block, and the pipeline's abort signal.
 * @returns Deep-frozen {@link ExecutionEvidence} — tagged call results, the
 *   resolved {@link ExecutionContext}, and per-probe snapshots.
 * @throws {ExternalServiceError} For chain mismatch, transport failures,
 *   timeouts, or malformed JSON-RPC envelopes.
 * @throws {InvalidSimulationResponseError} For a response that cannot be
 *   trusted (bad shape, call-count mismatch, block behind the pinned state,
 *   or a state-block hash that changed mid-flight).
 * @throws {SimulationRevertedError} When a user transaction reverts.
 * @throws {MissingVerificationEvidenceError} When a probe fails or cannot be
 *   decoded.
 * @internal
 */
export async function executePlan(params: {
  rpcUrl: string;
  plan: ExecutionPlan;
  pinnedBlock: PinnedBlock;
  signal?: AbortSignal;
}): Promise<ExecutionEvidence> {
  const { rpcUrl, plan, pinnedBlock, signal } = params;

  const client = createSimulationClient(rpcUrl, signal);

  let evidence: ExecutionEvidence;
  try {
    // (a) Endpoint chain identity must match the configured chain.
    const rpcChainId = await client.getChainId();
    if (rpcChainId !== plan.request.chainId) {
      throw new ExternalServiceError(
        `The RPC configured for chain ${plan.request.chainId} reports chain ${rpcChainId}. Fix SimulationConfig.chains.`,
      );
    }

    // (b) The state block was resolved once up front; simulate pinned on it.
    const stateBlock = pinnedBlock;

    // (c) Raw request: per-call `from` is honored and the response is parsed by
    // this package — not by viem's simulateCalls/simulateBlocks wrappers.
    const response = await client.request({
      method: "eth_simulateV1",
      params: [
        {
          blockStateCalls: [
            {
              stateOverrides: Object.fromEntries(
                plan.stateOverrides.map((override) => [
                  override.address,
                  { code: override.code },
                ]),
              ),
              calls: plan.calls.map((call) => ({
                from: call.transaction.from,
                to: call.transaction.to,
                data: call.transaction.data,
                value: numberToHex(call.transaction.value),
              })),
            },
          ],
          traceTransfers: true,
          validation: false,
        },
        numberToHex(stateBlock.number),
      ],
    });

    // Reorg window: the pinned state block must still carry the same hash
    // after simulation, or the evidence may describe a different chain tip.
    const stateBlockAfter = await client.getBlock({
      blockNumber: stateBlock.number,
    });
    if (stateBlockAfter.hash !== stateBlock.hash) {
      throw new InvalidSimulationResponseError(
        `State block ${stateBlock.number} hash changed during simulation (reorg): ${stateBlock.hash} became ${stateBlockAfter.hash}. Re-submit the simulation.`,
        {
          stage: "evidence",
          chainId: plan.request.chainId,
          mode: plan.request.mode,
        },
      );
    }

    // Response parsing is evidence validation, not transport — it must reach
    // the caller as InvalidSimulationResponseError, never ExternalServiceError.
    evidence = parseSimulationResponse({
      plan,
      response,
      stateBlockNumber: stateBlock.number,
      stateBlockHash: stateBlock.hash,
      stateBlockTimestamp: stateBlock.timestamp,
    });
  } catch (error) {
    if (error instanceof SimulationPackageError) throw error;
    // A node-level revert is a property of the bundle, not the backend. The
    // raw request surfaces it as a JSON-RPC error — code 3 for "execution
    // reverted", plus an "insufficient funds" failure for an unfundable
    // `value` transfer under real native funding (the code varies by node:
    // -32003 on geth-flavored Anvil, -32000 on others) — rather than viem's
    // ExecutionRevertedError.
    if (
      error instanceof ExecutionRevertedError ||
      (error instanceof Error &&
        "code" in error &&
        ((error as { code: unknown }).code === 3 ||
          (error as { code: unknown }).code === -32003 ||
          /insufficient funds/i.test(error.message)))
    ) {
      throw new SimulationRevertedError(
        error instanceof ExecutionRevertedError
          ? error.shortMessage
          : error.message,
        error,
      );
    }
    throw new ExternalServiceError(
      `eth_simulateV1 error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return evidence;
}
