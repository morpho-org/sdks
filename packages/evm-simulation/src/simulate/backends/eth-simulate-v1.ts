import {
  BaseError,
  type BlockTag,
  createPublicClient,
  ExecutionRevertedError,
  type Hex,
  http,
  numberToHex,
} from "viem";
import {
  ExternalServiceError,
  InvalidSimulationResponseError,
  SimulationPackageError,
  SimulationRevertedError,
  UnsupportedVerificationFeatureError,
} from "../../errors.js";
import type { ExecutionPlan } from "../plan/plan-execution.js";
import type { SimulationExecution } from "./parse-response.js";
import { parseSimulationResponse } from "./parse-response.js";

/**
 * Execute an {@link ExecutionPlan} through a single `eth_simulateV1` call and
 * collect the pinned execution.
 *
 * The boundary performs these steps under one shared abort/timeout budget:
 *
 * 1. **Single block resolution** — the requested `blockNumber`/tag/`latest`
 *    resolves to one concrete state block (`stateBlock*`). `latest` is
 *    therefore resolved exactly once; the simulation below pins that number
 *    so a drifting head cannot smear the result across blocks.
 * 2. **Chain identity** — `eth_chainId` must equal the request's `chainId`; a
 *    mismatch means the configured endpoint reports the wrong chain
 *    (`InvalidSimulationResponseError`, transport stage), not a simulation
 *    failure.
 * 3. **`eth_simulateV1`** — one `blockStateCalls` entry carrying the planned
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
 * result records whatever the node returns; consumers must read
 * {@link ExecutionBlock.blockNumber} and never assume +1.
 *
 * The endpoint must support `eth_simulateV1` with `stateOverrides` code
 * injection and per-call `from`; there is no fallback backend.
 *
 * @param params - RPC endpoint, the plan to execute, an optional block pin and
 *   the pipeline's abort signal.
 * @returns Deep-frozen {@link SimulationExecution} — tagged call results, the
 *   resolved {@link ExecutionBlock}, and per-probe native-balance readings.
 * @throws {ExternalServiceError} For transport failures, timeouts,
 *   malformed JSON-RPC envelopes, or a state block without number/hash.
 * @throws {InvalidSimulationResponseError} For a chain mismatch or a
 *   response that cannot be trusted (bad shape, call-count mismatch, block
 *   other than the pinned state block or its successor, or a state-block
 *   hash that changed mid-flight).
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
}): Promise<SimulationExecution> {
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

  let stateBlock: {
    readonly number: bigint;
    readonly hash: Hex;
    readonly timestamp: bigint;
  };
  try {
    // Resolve the state block exactly once so `latest` cannot drift.
    const block = await client.getBlock(
      typeof blockNumber === "bigint"
        ? { blockNumber }
        : { blockTag: blockNumber ?? "latest" },
    );
    if (block.number === null || block.hash === null) {
      throw new ExternalServiceError(
        "eth_getBlock returned a block without number or hash. Check that the endpoint resolved the requested state block.",
      );
    }
    stateBlock = {
      number: block.number,
      hash: block.hash,
      timestamp: block.timestamp,
    };

    // The configured endpoint must serve the request's chain.
    const rpcChainId = await client.getChainId();
    if (rpcChainId !== plan.request.chainId) {
      throw new InvalidSimulationResponseError(
        `The RPC configured for chain ${plan.request.chainId} reports chain ${rpcChainId}. Fix SimulationConfig.chains.`,
        {
          context: {
            stage: "transport",
            chainId: plan.request.chainId,
            mode: plan.request.mode,
            blockNumber: stateBlock.number,
          },
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

  // Feature gate once the state block is pinned (every error context carries
  // `blockNumber`): preview authorizations and consumer limits parse and
  // normalize, but are rejected until PR5/PR6 verify them rather than
  // silently ignored.
  if (plan.request.authorizations.length > 0) {
    throw new UnsupportedVerificationFeatureError(
      "Preview authorization preparation and verification are not implemented yet on the v5 integration branch. Submit the bundle without authorizations or wait for the authorization verification release.",
      {
        context: {
          stage: "preparation",
          mode: plan.request.mode,
          chainId: plan.request.chainId,
          blockNumber: stateBlock.number,
          authorizationIndex: 0,
        },
      },
    );
  }
  if (plan.request.limits !== undefined) {
    throw new UnsupportedVerificationFeatureError(
      "Consumer limit enforcement is not implemented yet on the v5 integration branch. Submit the bundle without limits or wait for the verification release.",
      {
        context: {
          stage: "validation",
          mode: plan.request.mode,
          chainId: plan.request.chainId,
          blockNumber: stateBlock.number,
        },
      },
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
        (error.code === 3 ||
          error.code === -32003 ||
          /insufficient funds/i.test(error.message)))
    ) {
      // The execution-stage context requires an operation-keyed subject and a
      // node-level revert precedes operation decoding, so no context attaches.
      // `details` carries only the URL-free code/shortMessage; the raw viem
      // error (which embeds the RPC URL) is kept as `cause` only.
      const reverted = new SimulationRevertedError(
        error instanceof BaseError
          ? error.details || error.shortMessage
          : error.message,
        {
          code:
            "code" in error && typeof error.code !== "undefined"
              ? error.code
              : undefined,
          shortMessage:
            error instanceof BaseError ? error.shortMessage : error.message,
        },
        "UNKNOWN_REVERT",
      );
      reverted.cause = error;
      throw reverted;
    }
    throw new ExternalServiceError(
      `eth_simulateV1 error: ${safeMessage(error)}`,
      { cause: error },
    );
  }

  // Reorg window: the pinned state block must still carry the same hash
  // after simulation, or the result may describe a different chain tip.
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
        context: {
          stage: "transport",
          chainId: plan.request.chainId,
          mode: plan.request.mode,
          blockNumber: stateBlock.number,
        },
      },
    );
  }

  // Response parsing is validation, not transport — it must reach
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
