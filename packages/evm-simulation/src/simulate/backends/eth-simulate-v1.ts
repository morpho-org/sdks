import {
  BaseError,
  type BlockTag,
  createPublicClient,
  ExecutionRevertedError,
  http,
  numberToHex,
} from "viem";
import type { ExecutionEvidence, ExecutionPlan } from "../../domain/stages.js";
import {
  ExternalServiceError,
  InvalidSimulationResponseError,
  SimulationPackageError,
  SimulationRevertedError,
  UnsupportedVerificationFeatureError,
} from "../../errors.js";
import { parseSimulationResponse } from "./parse-response.js";

/**
 * Execute an {@link ExecutionPlan} through a single `eth_simulateV1` call and
 * collect pinned evidence.
 *
 * The boundary performs these steps under one shared abort/timeout budget:
 *
 * 1. **Single block resolution** — the requested `blockNumber`/tag/`latest`
 *    resolves to one concrete state block (`stateBlock*`). `latest` is
 *    therefore resolved exactly once; the simulation below pins that number
 *    so a drifting head cannot smear the evidence across blocks.
 * 2. **Chain identity** — `eth_chainId` must equal the request's `chainId`; a
 *    mismatch means the configured endpoint reports the wrong chain
 *    (`InvalidSimulationResponseError`, transport stage), not a simulation
 *    failure.
 * 3. **Feature gate** — parsed `authorizations`/`limits` fail typed with
 *    `UnsupportedVerificationFeatureError` here (preparation stage, carrying
 *    the pinned state block) so a caller's input is never silently ignored
 *    before authorization preparation (PR5) and limit enforcement (PR6)
 *    land. The gate runs after block resolution and before `eth_simulateV1`.
 * 4. **`eth_simulateV1`** — one `blockStateCalls` entry carrying the planned
 *    calls with their per-call `from` (probes are sent from the zero address),
 *    the probe code override as `stateOverrides`, `traceTransfers: true` so
 *    the node synthesizes native-ETH moves as transfer logs, and
 *    `validation: false`. Validation-off means gas is not charged, which is
 *    how gas is separated from economic effects. **No balance override is
 *    applied** — `value` transfers are funded by the sender's real native
 *    balance.
 *
 * After the simulation the state block is re-fetched to detect a reorg that
 * swapped its hash mid-flight. The simulated block must be exactly
 * `stateBlockNumber` or `stateBlockNumber + 1`: geth-style nodes report the
 * former's successor while Anvil reports the pinned block itself. The
 * evidence records whatever the node returns; consumers must read
 * {@link ExecutionContext.blockNumber} and never assume +1.
 *
 * The endpoint must support `eth_simulateV1` with `stateOverrides` code
 * injection and per-call `from`; there is no fallback backend.
 *
 * @param params - RPC endpoint, the plan to execute, an optional block pin and
 *   the pipeline's abort signal.
 * @returns Deep-frozen {@link ExecutionEvidence} — tagged call results, the
 *   resolved {@link ExecutionContext}, and per-probe snapshots.
 * @throws {ExternalServiceError} For transport failures, timeouts,
 *   malformed JSON-RPC envelopes, or a state block without number/hash.
 * @throws {InvalidSimulationResponseError} For a chain mismatch or a
 *   response that cannot be trusted (bad shape, call-count mismatch, block
 *   other than the pinned state block or its successor, or a state-block
 *   hash that changed mid-flight).
 * @throws {UnsupportedVerificationFeatureError} For `authorizations`/`limits`
 *   passed before their verification releases land.
 * @throws {SimulationRevertedError} When a user transaction reverts.
 * @throws {MissingVerificationEvidenceError} When a probe fails or cannot be
 *   decoded.
 * @internal
 */
export async function executePlan(params: {
  rpcUrl: string;
  plan: ExecutionPlan;
  blockNumber?: bigint | BlockTag;
  signal?: AbortSignal;
}): Promise<ExecutionEvidence> {
  const { rpcUrl, plan, blockNumber, signal } = params;

  const client = createPublicClient({
    transport: http(rpcUrl, {
      fetchOptions: signal ? { signal } : undefined,
      // A failed request must not consume another attempt or a fresh budget.
      retryCount: 0,
      // The pipeline abort signal owns the overall execution deadline.
      timeout: signal ? 0 : undefined,
    }),
  });

  let stateBlock: Awaited<ReturnType<typeof client.getBlock>>;
  try {
    // Resolve the state block exactly once so `latest` cannot drift.
    stateBlock = await client.getBlock(
      typeof blockNumber === "bigint"
        ? { blockNumber }
        : { blockTag: blockNumber ?? "latest" },
    );
    if (stateBlock.number === null || stateBlock.hash === null) {
      throw new ExternalServiceError(
        "eth_getBlock returned a block without number or hash. Check that the endpoint resolved the requested state block.",
      );
    }

    // The configured endpoint must serve the request's chain.
    const rpcChainId = await client.getChainId();
    if (rpcChainId !== plan.request.chainId) {
      throw new InvalidSimulationResponseError(
        `The RPC configured for chain ${plan.request.chainId} reports chain ${rpcChainId}. Fix SimulationConfig.chains.`,
        {
          stage: "transport",
          chainId: plan.request.chainId,
          mode: plan.request.mode,
          blockNumber: stateBlock.number,
          blockHash: stateBlock.hash,
          blockTimestamp: stateBlock.timestamp,
        },
      );
    }
  } catch (error) {
    if (error instanceof SimulationPackageError) throw error;
    throw new ExternalServiceError(
      `eth_getBlock/eth_chainId error: ${safeMessage(error)}`,
      { cause: error },
    );
  }
  if (stateBlock.number === null || stateBlock.hash === null) {
    throw new ExternalServiceError(
      "eth_getBlock returned a block without number or hash. Check that the endpoint resolved the requested state block.",
    );
  }

  // Feature gate: preview authorizations and consumer limits parse and
  // normalize, but are rejected here until PR5/PR6 verify them.
  const preparationContext = {
    mode: plan.request.mode,
    stage: "preparation" as const,
    chainId: plan.request.chainId,
    blockNumber: stateBlock.number,
    blockHash: stateBlock.hash,
    blockTimestamp: stateBlock.timestamp,
  };
  if (plan.request.authorizations.length > 0) {
    throw new UnsupportedVerificationFeatureError(
      "Preview authorization preparation and verification are not implemented yet on the v5 integration branch. Submit the bundle without authorizations or wait for the authorization verification release.",
      preparationContext,
    );
  }
  if (plan.request.limits !== undefined) {
    throw new UnsupportedVerificationFeatureError(
      "Consumer limit enforcement is not implemented yet on the v5 integration branch. Submit the bundle without limits or wait for the verification release.",
      preparationContext,
    );
  }

  // Raw request: per-call `from` is honored and the response is parsed by
  // this package — not by viem's simulateCalls/simulateBlocks wrappers.
  let response: unknown;
  try {
    response = await client.request({
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
  } catch (error) {
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
      throw new SimulationRevertedError(safeMessage(error), error);
    }
    throw new ExternalServiceError(
      `eth_simulateV1 error: ${safeMessage(error)}`,
      { cause: error },
    );
  }

  // Reorg window: the pinned state block must still carry the same hash
  // after simulation, or the evidence may describe a different chain tip.
  let stateBlockAfter: Awaited<ReturnType<typeof client.getBlock>>;
  try {
    stateBlockAfter = await client.getBlock({
      blockNumber: stateBlock.number,
    });
  } catch (error) {
    throw new ExternalServiceError(
      `eth_getBlock error: ${safeMessage(error)}`,
      {
        cause: error,
      },
    );
  }
  if (stateBlockAfter.hash !== stateBlock.hash) {
    throw new InvalidSimulationResponseError(
      `State block ${stateBlock.number} hash changed during simulation (reorg): ${stateBlock.hash} became ${stateBlockAfter.hash}. Re-submit the simulation.`,
      {
        stage: "transport",
        chainId: plan.request.chainId,
        mode: plan.request.mode,
        blockNumber: stateBlock.number,
        blockHash: stateBlock.hash,
        blockTimestamp: stateBlock.timestamp,
      },
    );
  }

  // Response parsing is evidence validation, not transport — it must reach
  // the caller as InvalidSimulationResponseError, never ExternalServiceError.
  return parseSimulationResponse({
    plan,
    response,
    stateBlockNumber: stateBlock.number,
    stateBlockHash: stateBlock.hash,
    stateBlockTimestamp: stateBlock.timestamp,
  });
}

/**
 * Trim a caught error to a safe message: viem's `shortMessage` drops the
 * URL/request-body details its `message` embeds. The original error is always
 * kept as `cause` for logging.
 */
const safeMessage = (error: unknown): string =>
  error instanceof BaseError
    ? error.shortMessage
    : error instanceof Error
      ? error.message
      : String(error);
