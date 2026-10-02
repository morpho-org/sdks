import {
  BaseError,
  BlockNotFoundError,
  createPublicClient,
  ExecutionRevertedError,
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
 * Classify a node-level revert: viem's `ExecutionRevertedError`, or a raw
 * JSON-RPC error — code 3 for "execution reverted", plus an "insufficient
 * funds" message for an unfundable `value` transfer under real native
 * funding (the numeric code varies by node, so the message is matched).
 */
const isNodeRevert = (error: unknown): error is Error =>
  error instanceof ExecutionRevertedError ||
  (error instanceof Error &&
    "code" in error &&
    (error.code === 3 || /insufficient funds/i.test(error.message)));

/**
 * Trim a caught error to a safe message: viem's `shortMessage` drops the
 * URL/request-body details its `message` embeds. The original error is always
 * kept as `cause` for logging.
 */
const safeMessage = (error: unknown): string =>
  error instanceof BaseError ? error.shortMessage : String(error);

/** The JSON-RPC methods this boundary calls. */
type RpcLabel = "eth_getBlock" | "eth_chainId" | "eth_simulateV1";

/** Map a caught error to the boundary's typed failure for `label`. */
const toBoundaryError = (
  label: RpcLabel,
  error: unknown,
): SimulationPackageError => {
  if (error instanceof SimulationPackageError) return error;
  // A node-level revert is a property of the bundle, not the backend. The
  // execution-stage context requires an operation-keyed subject and a
  // node-level revert precedes operation decoding, so no context attaches.
  // `details` carries only the URL-free code/shortMessage; the raw viem
  // error (which embeds the RPC URL) is kept as `cause` only.
  if (label === "eth_simulateV1" && isNodeRevert(error)) {
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
    return reverted;
  }
  return new ExternalServiceError(`${label} error: ${safeMessage(error)}`, {
    cause: error,
  });
};

/** Run one RPC call; anything thrown becomes a typed boundary error. */
const rpc = async <T>(label: RpcLabel, call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    throw toBoundaryError(label, error);
  }
};

/**
 * Execute an {@link ExecutionPlan} through a single `eth_simulateV1` call and
 * collect the pinned execution.
 *
 * The boundary performs these steps under one shared abort/timeout budget:
 *
 * 1. **Chain identity** — `eth_chainId` must equal the request's `chainId`; a
 *    mismatch means the configured endpoint reports the wrong chain
 *    (`InvalidSimulationResponseError`, transport stage), not a simulation
 *    failure. It runs first so a misconfigured endpoint cannot fail earlier
 *    as a bypassable {@link ExternalServiceError}.
 * 2. **Single block resolution** — the request's `blockNumber`/tag/`latest`
 *    resolves to one concrete state block (`stateBlock*`). `latest` is
 *    therefore resolved exactly once; the simulation below pins that number
 *    so a drifting head cannot smear the result across blocks.
 * 3. **`eth_simulateV1`** — one `blockStateCalls` entry carrying the planned
 *    calls with their per-call `from`, `traceTransfers: true` so the node
 *    synthesizes native-ETH moves as transfer logs, and
 *    `validation: false`. Validation-off means gas is not charged, which is
 *    how gas is separated from economic effects. **No balance override is
 *    applied** — `value` transfers are funded by the sender's real native
 *    balance.
 * 4. **Response validation** — the response is parsed before the reorg
 *    re-fetch so revert/mismatch evidence already in hand surfaces instead
 *    of being downgraded to a bypassable {@link ExternalServiceError} by a
 *    failing re-fetch. The simulated block must be exactly
 *    `stateBlockNumber` or `stateBlockNumber + 1`: geth-style nodes report
 *    the former's successor while Anvil reports the pinned block itself.
 *    The result records whatever the node returns; consumers must read
 *    {@link ExecutionBlock.blockNumber} and never assume +1.
 * 5. **Reorg check** — the state block is re-fetched last to detect a reorg
 *    that swapped its hash mid-flight (`InvalidSimulationResponseError`).
 *
 * The endpoint must support `eth_simulateV1` with per-call `from`; there is
 * no fallback backend.
 *
 * @param params - RPC endpoint, the plan to execute, and the pipeline's
 *   abort signal. The block pin rides on `plan.request.blockNumber`.
 * @returns Deep-frozen {@link SimulationExecution} — per-transaction call
 *   results and the resolved {@link ExecutionBlock}.
 * @throws {ExternalServiceError} For transport failures, timeouts,
 *   malformed JSON-RPC envelopes, or a state block without number/hash.
 * @throws {InvalidSimulationResponseError} For a chain mismatch or a
 *   response that cannot be trusted (bad shape, call-count mismatch, block
 *   other than the pinned state block or its successor, a successor whose
 *   `parentHash` is not the pinned hash, a block timestamp earlier than the
 *   pinned block's, a per-call result that fails normalization, or a
 *   state-block hash that changed mid-flight).
 * @throws {SimulationRevertedError} When a user transaction reverts or the
 *   node reports a bundle-level revert (code 3 / insufficient funds).
 * @throws {UnsupportedVerificationFeatureError} When preview `authorizations`
 *   or `limits` are present once the state block is pinned, until PR5/PR6.
 * @internal
 */
export async function executePlan(params: {
  rpcUrl: string;
  plan: ExecutionPlan;
  signal?: AbortSignal;
}): Promise<SimulationExecution> {
  const { rpcUrl, plan, signal } = params;
  const blockNumber = plan.request.blockNumber ?? "latest";

  const client = createPublicClient({
    transport: http(rpcUrl, {
      fetchOptions: signal ? { signal } : undefined,
      // A failed request must not consume another attempt or a fresh budget.
      retryCount: 0,
      // The pipeline abort signal owns the overall execution deadline.
      timeout: signal ? 0 : undefined,
    }),
  });

  // The configured endpoint must serve the request's chain — checked first
  // so a misconfigured endpoint fails non-bypassably instead of surfacing a
  // bypassable transport error on the block lookup below. Error contexts
  // require a resolved `blockNumber`, so tag requests carry none.
  const rpcChainId = await rpc("eth_chainId", () => client.getChainId());
  if (rpcChainId !== plan.request.chainId) {
    throw new InvalidSimulationResponseError(
      `The RPC configured for chain ${plan.request.chainId} reports chain ${rpcChainId}. Fix SimulationConfig.chains.`,
      {
        ...(typeof blockNumber === "bigint"
          ? {
              context: {
                stage: "transport" as const,
                chainId: plan.request.chainId,
                mode: plan.request.mode,
                blockNumber,
              },
            }
          : {}),
      },
    );
  }

  // Resolve the state block exactly once so `latest` cannot drift.
  const block = await rpc("eth_getBlock", () =>
    client.getBlock(
      typeof blockNumber === "bigint"
        ? { blockNumber }
        : { blockTag: blockNumber },
    ),
  );
  if (block.number === null || block.hash === null) {
    throw new ExternalServiceError(
      "eth_getBlock returned a block without number or hash. Check that the endpoint resolved the requested state block.",
    );
  }
  const stateBlock = {
    number: block.number,
    hash: block.hash,
    timestamp: block.timestamp,
  };

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
  const response = await rpc("eth_simulateV1", () =>
    client.request({
      method: "eth_simulateV1",
      params: [
        {
          blockStateCalls: [
            {
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
    }),
  );

  // Response parsing is validation, not transport — it runs before the
  // reorg re-fetch so evidence already in hand reaches the caller as
  // InvalidSimulationResponseError / SimulationRevertedError instead of
  // being downgraded to a bypassable ExternalServiceError by a failing
  // re-fetch.
  const execution = parseSimulationResponse({
    plan,
    response,
    stateBlockNumber: stateBlock.number,
    stateBlockHash: stateBlock.hash,
    stateBlockTimestamp: stateBlock.timestamp,
  });

  // Reorg window: the pinned state block must still carry the same hash
  // after simulation, or the result may describe a different chain tip.
  // A pinned block the node no longer serves is the same reorg signal as a
  // changed hash, so it must not degrade into a bypassable transport error.
  const stateBlockAfter = await rpc("eth_getBlock", () =>
    client.getBlock({ blockNumber: stateBlock.number }),
  ).catch((error: unknown) => {
    if (
      error instanceof ExternalServiceError &&
      error.cause instanceof BlockNotFoundError
    )
      return null;
    throw error;
  });
  if (stateBlockAfter?.hash !== stateBlock.hash) {
    throw new InvalidSimulationResponseError(
      `State block ${stateBlock.number} hash changed during simulation (reorg): ${stateBlock.hash} became ${stateBlockAfter?.hash ?? "unavailable"}. Re-submit the simulation.`,
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

  return execution;
}
