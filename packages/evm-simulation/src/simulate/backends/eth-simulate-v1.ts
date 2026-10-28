import {
  BaseError,
  type Client,
  ExecutionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  isHex,
  numberToHex,
  UnknownRpcError,
} from "viem";
import {
  InvalidChainIdError,
  InvalidSimulationResponseError,
  RpcTransportError,
  SimulationPackageError,
  SimulationRevertedError,
} from "../../errors.js";
import type { StateBlock } from "../../params.js";
import type { ExecutionPlan } from "../plan/plan-execution.js";
import { formatRevert } from "./decode-revert.js";
import type { SimulationExecution } from "./parse-response.js";
import { parseSimulationResponse } from "./parse-response.js";

/**
 * Classify a node-level revert: viem's `ExecutionRevertedError`, or a raw
 * JSON-RPC error matched by code 3, or by message under any code (the code
 * varies by node): "insufficient funds" for an unfundable `value` transfer,
 * "execution reverted" (geth/Erigon `-32000`) and Nethermind's "VM execution
 * error". This includes a JSON-RPC error body served with an HTTP error status;
 * a body that is not JSON-RPC (an `HttpRequestError`, any status) is never
 * matched by message.
 */
const isNodeRevert = (error: unknown): boolean =>
  error instanceof ExecutionRevertedError ||
  (error instanceof Error &&
    (("code" in error && error.code === 3) ||
      // A JSON-RPC error body arrives as an RPC error, so an HttpRequestError
      // carries a body that is not JSON-RPC: not a node verdict, whatever its
      // wording.
      (!(error instanceof HttpRequestError) &&
        /insufficient funds|execution reverted|vm execution error/i.test(
          error.message,
        ))));

/**
 * `eth_simulateV1` error code for a sender that cannot fund `value`
 * (execution-apis; returned by geth and Anvil).
 */
const SIMULATE_INSUFFICIENT_FUNDS_CODE = -38014;

/** The JSON-RPC methods this boundary calls. */
type RpcLabel = "eth_getBlock" | "eth_getCode" | "eth_simulateV1";

/** Map a caught error to the boundary's typed failure for `label`. */
const toBoundaryError = (
  label: RpcLabel,
  error: unknown,
): SimulationPackageError => {
  if (error instanceof SimulationPackageError) return error;
  // Only the structured signal (viem's class or the simulate code) selects the
  // funding message; "insufficient funds" message text alone keeps the generic one.
  const insufficientFunds =
    error instanceof BaseError
      ? error.walk(
          (cause) =>
            cause instanceof InsufficientFundsError ||
            (cause instanceof BaseError &&
              "code" in cause &&
              cause.code === SIMULATE_INSUFFICIENT_FUNDS_CODE),
        ) !== null
      : error instanceof Error &&
        "code" in error &&
        error.code === SIMULATE_INSUFFICIENT_FUNDS_CODE;
  // Preserve node-returned bytes and keep the original provider error as cause.
  if (
    label === "eth_simulateV1" &&
    (insufficientFunds || isNodeRevert(error))
  ) {
    const dataError =
      error instanceof BaseError
        ? error.walk(
            (cause) =>
              cause instanceof Error && "data" in cause && isHex(cause.data),
          )
        : error;
    const revertData =
      dataError instanceof Error && "data" in dataError && isHex(dataError.data)
        ? dataError.data
        : undefined;
    const message =
      formatRevert(revertData) ??
      (insufficientFunds
        ? "Sender native balance cannot fund transaction value. Fund the sender or reduce value."
        : "Revert reason unavailable");
    return new SimulationRevertedError(message, revertData, { cause: error });
  }
  // A wrong-chain endpoint is misconfiguration, not an outage: callers must
  // not bypass it. Each node words the per-call
  // `chainId` rejection differently: geth "chainId does not match node's",
  // Anvil "invalid chain id for signer", Monad "Invalid chain ID: expected …".
  if (
    label === "eth_simulateV1" &&
    error instanceof Error &&
    /chainId does not match node's|invalid chain id/i.test(error.message)
  ) {
    return new InvalidChainIdError(
      "eth_simulateV1 endpoint rejected the request chainId. Point SimulationConfig.chains at an RPC URL for this chain.",
      { cause: error },
    );
  }
  // A node that answered 2xx with a body that is not JSON or not a JSON-RPC
  // object returned something, not nothing: an integrity failure the caller
  // must not bypass as an outage. The simulation client keeps the status on
  // every error status, so a status-less parse failure is a 2xx reply.
  if (
    (error instanceof HttpRequestError &&
      error.status === undefined &&
      error.cause instanceof SyntaxError) ||
    (error instanceof UnknownRpcError && error.cause instanceof TypeError)
  )
    return new InvalidSimulationResponseError(
      `${label} returned a body that is not a valid JSON-RPC response. Check that the RPC URL points at a JSON-RPC endpoint.`,
      { cause: error },
    );

  return new RpcTransportError(
    "RPC request failed. Check the endpoint and try again.",
    { cause: error },
  );
};

/** Run one RPC call; translate domain failures and wrap other RPC failures. @internal */
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
 *    calls with their per-call `from` and `chainId`, `traceTransfers: true`
 *    so the node synthesizes native-ETH moves as transfer logs, and `validation: false`
 *    (`true` on Monad, whose nodes reject `false` and charge no gas in the
 *    simulated block). Validation-off means gas is not charged, which is how
 *    gas is separated from economic effects. When `blockGasLimit` is set,
 *    it is sent as the block's `blockOverrides.gasLimit`; otherwise no block
 *    override is sent. When `callGasLimit` is set, it is sent as `gas` on every
 *    call; otherwise no per-call `gas` is sent.
 *    **No balance override is
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
 * @param params - Shared simulation client, execution plan (its request
 *   `chainId` is sent on every call), state block, the `validation` flag to
 *   send, the optional simulated block gas limit and per-call gas limit, and
 *   whether to check the successor `parentHash`.
 * @returns Deep-frozen {@link SimulationExecution} — per-transaction call
 *   results and the resolved {@link ExecutionBlock}.
 * @throws {RpcTransportError} For transport failures, timeouts, HTTP error
 *   statuses and JSON-RPC errors that are not a node-level revert or chain-ID
 *   rejection.
 * @throws {InvalidSimulationResponseError} For a response that cannot be
 *   trusted (a 2xx body that is not JSON or not a JSON-RPC object (e.g. a bare `null`), bad shape, call-count mismatch, block other than the state block
 *   or its successor, a block timestamp earlier than the state block's, or a
 *   per-call result that fails normalization).
 * @throws {InvalidChainIdError} When the node rejects the request `chainId`
 *   because it serves another chain (a subclass of
 *   `InvalidSimulationResponseError` sharing its `name`/`code`;
 *   `instanceof InvalidChainIdError` tells them apart).
 * @throws {SlippageCheckUnavailableError} When a planned state read fails.
 * @throws {SimulationAssertError} When an assertion fails, its read reverts,
 *   or its check throws (the thrown error is preserved as `cause`).
 * @throws {SimulationLogAssertError} When an `assertLogs` check returns a
 *   failure message or throws; a thrown check error is kept as `cause`.
 * @throws {SimulationRevertedError} When a preparation or user transaction
 *   reverts or the node reports a bundle-level revert (code 3, an
 *   `execution reverted` / `VM execution error` message, or insufficient funds).
 * @internal
 */
export async function executePlan(params: {
  client: Client;
  plan: ExecutionPlan;
  stateBlock: StateBlock;
  validation: boolean;
  blockGasLimit?: bigint | undefined;
  callGasLimit?: bigint | undefined;
  parentHashCheck: boolean;
}): Promise<SimulationExecution> {
  const {
    client,
    plan,
    stateBlock,
    validation,
    blockGasLimit,
    callGasLimit,
    parentHashCheck,
  } = params;

  const response = await rpc("eth_simulateV1", () =>
    client.request({
      method: "eth_simulateV1",
      params: [
        {
          blockStateCalls: [
            {
              ...(blockGasLimit !== undefined && {
                blockOverrides: { gasLimit: numberToHex(blockGasLimit) },
              }),
              calls: plan.calls.map((call) => ({
                chainId: numberToHex(plan.request.chainId),
                from: call.transaction.from,
                to: call.transaction.to,
                data: call.transaction.data,
                value: numberToHex(call.transaction.value),
                ...(callGasLimit !== undefined && {
                  gas: numberToHex(callGasLimit),
                }),
              })),
            },
          ],
          traceTransfers: true,
          validation,
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
    parentHashCheck,
  });
}
