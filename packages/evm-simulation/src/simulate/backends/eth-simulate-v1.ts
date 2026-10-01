import {
  BaseError,
  createPublicClient,
  ExecutionRevertedError,
  http,
  InsufficientFundsError,
} from "viem";
import { simulateBlocks } from "viem/actions";
import {
  ExternalServiceError,
  InvalidSimulationResponseError,
  SimulationPackageError,
  SimulationRevertedError,
} from "../../errors.js";
import type { ExecutionPlan } from "../plan/plan-execution.js";
import type { SimulationExecution } from "./parse-response.js";
import { parseSimulationResponse } from "./parse-response.js";
import type { PinnedBlock } from "./resolve-pinned-block.js";

/**
 * Classify a node-level revert: viem's `ExecutionRevertedError`, or a raw
 * JSON-RPC error — code 3 for "execution reverted", plus an "insufficient
 * funds" message for an unfundable `value` transfer under real native
 * funding (the numeric code varies by node, so the message is matched).
 */
const isNodeRevert = (error: unknown): error is Error =>
  error instanceof ExecutionRevertedError ||
  error instanceof InsufficientFundsError ||
  (error instanceof Error && "code" in error && error.code === 3);

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
 * The caller checks the endpoint chain identity and resolves the pinned state
 * block before this boundary. This function uses that same block for the
 * simulation and reorg check under the shared abort/timeout budget.
 *
 * The boundary performs these steps:
 *
 * 1. **`eth_simulateV1`** — one `blockStateCalls` entry carrying the planned
 *    calls with their per-call `from`, `traceTransfers: true` so the node
 *    synthesizes native-ETH moves as transfer logs, and
 *    `validation: false`. Validation-off means gas is not charged, which is
 *    how gas is separated from economic effects. **No balance override is
 *    applied** — `value` transfers are funded by the sender's real native
 *    balance.
 * 2. **Response validation** — the response is parsed before the reorg
 *    re-fetch so revert/mismatch evidence already in hand surfaces instead
 *    of being downgraded to a bypassable {@link ExternalServiceError} by a
 *    failing re-fetch. The simulated block must be exactly
 *    `stateBlockNumber` or `stateBlockNumber + 1`: geth-style nodes report
 *    the former's successor while Anvil reports the pinned block itself.
 *    The result records whatever the node returns; consumers must read
 *    {@link ExecutionBlock.blockNumber} and never assume +1.
 * 3. **Reorg check** — the pinned state block is re-fetched last to detect a reorg
 *    that swapped its hash mid-flight (`InvalidSimulationResponseError`).
 *
 * The endpoint must support `eth_simulateV1` with per-call `from`; there is
 * no fallback backend.
 *
 * @param params - RPC endpoint, execution plan, already-pinned state block,
 *   and the pipeline's abort signal.
 * @returns Deep-frozen {@link SimulationExecution} — per-transaction call
 *   results and the resolved {@link ExecutionBlock}.
 * @throws {ExternalServiceError} For transport failures, timeouts,
 *   malformed JSON-RPC envelopes, or a state block without number/hash.
 * @throws {InvalidSimulationResponseError} For a response that cannot be
 *   trusted (bad shape, call-count mismatch, block
 *   other than the pinned state block or its successor, a block timestamp
 *   earlier than the pinned block's, or a state-block hash that changed
 *   mid-flight).
 * @throws {SimulationRevertedError} When a user transaction reverts or the
 *   node reports a bundle-level revert (code 3 / insufficient funds).
 * @internal
 */
export async function executePlan(params: {
  rpcUrl: string;
  plan: ExecutionPlan;
  stateBlock: PinnedBlock;
  signal?: AbortSignal;
}): Promise<SimulationExecution> {
  const { rpcUrl, plan, stateBlock, signal } = params;

  const client = createPublicClient({
    transport: http(rpcUrl, {
      fetchOptions: signal ? { signal } : undefined,
      // A failed request must not consume another attempt or a fresh budget.
      retryCount: 0,
      // The pipeline abort signal owns the overall execution deadline.
      timeout: signal ? 0 : undefined,
    }),
  });

  // viem's simulateBlocks serializes per-call senders (`account` → `from`)
  // and formats the result for us.
  const response = await rpc("eth_simulateV1", () =>
    simulateBlocks(client, {
      blocks: [
        {
          calls: plan.calls.map((call) => ({
            account: call.transaction.from,
            to: call.transaction.to,
            data: call.transaction.data,
            value: call.transaction.value,
          })),
        },
      ],
      traceTransfers: true,
      validation: false,
      blockNumber: stateBlock.number,
    }),
  );

  // Response parsing is validation, not transport — it runs before the
  // reorg re-fetch so evidence already in hand reaches the caller as
  // InvalidSimulationResponseError / SimulationRevertedError instead of
  // being downgraded to a bypassable ExternalServiceError by a failing
  // re-fetch.
  const execution = parseSimulationResponse({
    plan,
    blocks: response,
    stateBlockNumber: stateBlock.number,
    stateBlockHash: stateBlock.hash,
    stateBlockTimestamp: stateBlock.timestamp,
  });

  // Reorg window: the pinned state block must still carry the same hash
  // after simulation, or the result may describe a different chain tip.
  const stateBlockAfter = await rpc("eth_getBlock", () =>
    client.getBlock({ blockNumber: stateBlock.number }),
  );
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

  return execution;
}
