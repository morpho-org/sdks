import {
  BaseError,
  type Client,
  ExecutionRevertedError,
  InsufficientFundsError,
  numberToHex,
} from "viem";
import {
  ExternalServiceError,
  SimulationPackageError,
  SimulationRevertedError,
} from "../../errors.js";
import type { StateBlock } from "../../params.js";
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
  error instanceof InsufficientFundsError ||
  (error instanceof Error &&
    (("code" in error && error.code === 3) ||
      /insufficient funds/i.test(error.message)));

/**
 * Trim a caught error to a safe message: viem's `shortMessage` drops the
 * URL/request-body details its `message` embeds. The original error is always
 * kept as `cause` for logging.
 */
const safeMessage = (error: unknown): string =>
  error instanceof BaseError ? error.shortMessage : String(error);

/** The JSON-RPC methods this boundary calls. */
type RpcLabel = "eth_getBlock" | "eth_simulateV1";

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

/** Run one RPC call; anything thrown becomes a typed boundary error. @internal */
export const rpc = async <T>(
  label: RpcLabel,
  call: () => Promise<T>,
): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    throw toBoundaryError(label, error);
  }
};

/**
 * Execute an {@link ExecutionPlan} through a single `eth_simulateV1` call and
 * collect the pinned execution. This is the boundary's only RPC request.
 *
 * The caller resolves (or supplies) the state block before this boundary.
 *
 * 1. **`eth_simulateV1`** — one `blockStateCalls` entry carrying the planned
 *    calls with their per-call `from`, `traceTransfers: true` so the node
 *    synthesizes native-ETH moves as transfer logs, and
 *    `validation: false`. Validation-off means gas is not charged, which is
 *    how gas is separated from economic effects. **No balance override is
 *    applied** — `value` transfers are funded by the sender's real native
 *    balance.
 * 2. **Response validation** — the simulated block must be exactly
 *    `stateBlockNumber` or `stateBlockNumber + 1`: geth-style nodes report
 *    the former's successor while Anvil reports the pinned block itself.
 *    The result records whatever the node returns; consumers must read
 *    {@link ExecutionBlock.blockNumber} and never assume +1.
 *
 * The endpoint must support `eth_simulateV1` with per-call `from`; there is
 * no fallback backend.
 *
 * @param params - Shared simulation client, execution plan, and state block.
 * @returns Deep-frozen {@link SimulationExecution} — per-transaction call
 *   results and the resolved {@link ExecutionBlock}.
 * @throws {ExternalServiceError} For transport failures, timeouts,
 *   or malformed JSON-RPC envelopes.
 * @throws {InvalidSimulationResponseError} For a response that cannot be
 *   trusted (bad shape, call-count mismatch, block other than the state block
 *   or its successor, a block timestamp earlier than the state block's, or a
 *   per-call result that fails normalization).
 * @throws {MissingVerificationEvidenceError} When a planned state read fails.
 * @throws {SimulationRevertedError} When a preparation or user transaction
 *   reverts or the node reports a bundle-level revert (code 3 / insufficient
 *   funds).
 * @internal
 */
export async function executePlan(params: {
  client: Client;
  plan: ExecutionPlan;
  stateBlock: StateBlock;
}): Promise<SimulationExecution> {
  const { client, plan, stateBlock } = params;

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

  return parseSimulationResponse({
    plan,
    blocks: response,
    stateBlockNumber: stateBlock.number,
    stateBlockHash: stateBlock.hash,
    stateBlockTimestamp: stateBlock.timestamp,
  });
}
