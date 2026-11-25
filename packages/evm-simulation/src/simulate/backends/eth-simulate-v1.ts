import {
  BaseError,
  type Client,
  ExecutionRevertedError,
  type Hex,
  HttpRequestError,
  InsufficientFundsError,
  isHex,
  numberToHex,
  type PublicRpcSchema,
  UnknownRpcError,
} from "viem";
import {
  InvalidSimulationResponseError,
  RpcTransportError,
  SimulationPackageError,
  SimulationRevertedError,
} from "../../errors.js";
import type { StateBlock } from "../../params.js";
import type { ExecutionPlan, PlannedCall } from "../plan/plan-execution.js";
import { formatRevert } from "./decode-revert.js";
import { evaluateCalls } from "./evaluate-calls.js";
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

/** Extend viem's number-only simulate selector with EIP-1898 at the RPC boundary. */
type HashSimulationRpc = {
  Parameters: [
    Extract<
      PublicRpcSchema[number],
      { Method: "eth_simulateV1" }
    >["Parameters"][0],
    { blockHash: Hex; requireCanonical: true },
  ];
  ReturnType: unknown;
};

/** Map a caught error to the boundary's typed failure for `label`. */
const toBoundaryError = (
  label: RpcLabel,
  error: unknown,
): SimulationPackageError => {
  if (error instanceof SimulationPackageError) {
    return error;
  }
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
  // A body that is not JSON or not a JSON-RPC object, with no HTTP status, is
  // treated as an integrity failure the caller must not bypass as an outage.
  // viem drops the status when an error reply is labelled JSON, so with the
  // caller's transport this can also be an HTTP error reply (see README).
  if (
    (error instanceof HttpRequestError &&
      error.status === undefined &&
      error.cause instanceof SyntaxError) ||
    (error instanceof UnknownRpcError && error.cause instanceof TypeError)
  ) {
    return new InvalidSimulationResponseError(
      `${label} returned a body that is not a valid JSON-RPC response. Check that the RPC URL points at a JSON-RPC endpoint.`,
      { cause: error },
    );
  }

  return new RpcTransportError(
    "RPC request failed. Check the endpoint and try again.",
    { cause: error },
  );
};

/**
 * Most gas sent as `gas` on one read-only evidence read the SDK inserts
 * (balance and position reads, not derivation reads), when the caller sets
 * neither `callGasLimit` nor `blockOverrides.gasLimit`. Far above a
 * `balanceOf` or position view; it keeps nodes such as Monad, which reserve
 * 150M gas per call without `gas`, from spending their simulation cap on SDK
 * reads.
 * @internal
 */
export const EVIDENCE_READ_GAS_LIMIT = 1_000_000n;

/**
 * Most gas the SDK's evidence reads carry in total, and never more than half
 * the pinned block's gas limit. Reth-style nodes reject a simulated block
 * whose explicit call gas exceeds the block gas limit (3M in HyperEVM small
 * blocks, 30M on Arc) and share what is left between calls without `gas`, so
 * many reads split this budget instead of each taking
 * {@link EVIDENCE_READ_GAS_LIMIT}, leaving at least half the block to user
 * transactions. A node whose block response omits `gasLimit` gets this full
 * budget.
 * @internal
 */
export const EVIDENCE_READ_GAS_BUDGET = 15_000_000n;

/**
 * Least gas one evidence read carries. When the budget cannot give each read
 * this much (more than 150 reads in a 30M block, more than 15 in a 3M block),
 * enough for the 21,000 intrinsic gas plus a `balanceOf` or position view, the
 * SDK sends no `gas` on its reads and the node default applies, as for every
 * read before the budget existed.
 * @internal
 */
export const EVIDENCE_READ_GAS_FLOOR = 100_000n;

const isEvidenceRead = (call: PlannedCall) =>
  call.type === "stateRead" && call.read.kind !== "derivation";

/** Gas for each evidence read of `plan`: an equal share of the budget (capped at half of `blockGasLimit`) up to the per-read limit, or none below the floor. */
function evidenceReadGas(
  plan: ExecutionPlan,
  blockGasLimit: bigint | undefined,
): bigint | undefined {
  const halfBlock =
    blockGasLimit === undefined ? undefined : blockGasLimit / 2n;
  const budget =
    halfBlock !== undefined && halfBlock < EVIDENCE_READ_GAS_BUDGET
      ? halfBlock
      : EVIDENCE_READ_GAS_BUDGET;
  const count = BigInt(plan.calls.filter(isEvidenceRead).length);
  const share = count === 0n ? EVIDENCE_READ_GAS_LIMIT : budget / count;
  if (share < EVIDENCE_READ_GAS_FLOOR) {
    return undefined;
  }
  return share < EVIDENCE_READ_GAS_LIMIT ? share : EVIDENCE_READ_GAS_LIMIT;
}

/** Per-call `gas`: the caller's limit, else the evidence-read gas for SDK reads without a block override. */
function callGas(
  call: PlannedCall,
  {
    blockGasLimit,
    callGasLimit,
    evidenceGas,
  }: {
    blockGasLimit?: bigint | undefined;
    callGasLimit?: bigint | undefined;
    evidenceGas: bigint | undefined;
  },
): bigint | undefined {
  if (callGasLimit !== undefined) {
    return callGasLimit;
  }
  if (blockGasLimit !== undefined) {
    return undefined;
  }
  return isEvidenceRead(call) ? evidenceGas : undefined;
}

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
 *    call; otherwise only SDK evidence reads carry `gas`
 *    ({@link EVIDENCE_READ_GAS_LIMIT}, together at most
 *    {@link EVIDENCE_READ_GAS_BUDGET} and half the state block's gas limit),
 *    and none do when `blockGasLimit` is set.
 *    Caller-provided `stateOverrides` apply once before all planned calls; no
 *    overrides are injected automatically. Without a caller balance override,
 *    `value` transfers are funded by the sender's real native balance.
 * 2. **Response validation** — the simulated block must be exactly
 *    `stateBlockNumber` or `stateBlockNumber + 1`: geth-style nodes report
 *    the former's successor while Anvil reports the pinned block itself.
 *    The result records whatever the node returns; consumers must read
 *    {@link ExecutionBlock.blockNumber} and never assume +1.
 * 3. **Call checks** — after parsing, `evaluateCalls` checks preparation
 *    reverts, then each transaction's assertions and revert in call order,
 *    then every planned state read.
 *
 * The endpoint must support `eth_simulateV1` with per-call `from`; there is
 * no fallback backend. Pinned state is selected by EIP-1898 block hash.
 * A rejected hash selector
 * is reported as a typed RPC failure, never retried with a number selector.
 *
 * @param params - Caller-owned viem client, execution plan (its request
 *   `chainId` is sent on every call), state block, the `validation` flag to
 *   send, the optional simulated block gas limit and per-call gas limit, and
 *   whether to check the successor `parentHash`.
 * @returns Frozen {@link SimulationExecution} data — per-transaction call
 *   results, collected assertion and state-read failures, and the resolved {@link ExecutionBlock}.
 * @throws {RpcTransportError} For transport failures, timeouts, HTTP error
 *   statuses and JSON-RPC errors that are not a node-level revert, including
 *   a node's rejection of the request's chain ID or block hash selector.
 * @throws {InvalidSimulationResponseError} For a response that cannot be
 *   trusted (a 2xx body that is not JSON or not a JSON-RPC object (e.g. a bare `null`), bad shape, call-count mismatch, block other than the state block
 *   or its successor, a block timestamp earlier than the state block's, or a
 *   per-call result that fails normalization).
 * @throws {SimulationRevertedError} When a preparation reverts or the node
 *   reports a bundle-level revert (code 3, an
 *   `execution reverted` / `VM execution error` message, or insufficient funds).
 *   A user-transaction revert is returned as `reverted` with its failures.
 * @internal
 */
export async function executePlan(params: {
  client: Client;
  plan: ExecutionPlan;
  stateBlock: StateBlock & { readonly gasLimit?: bigint };
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

  const evidenceGas = evidenceReadGas(plan, stateBlock.gasLimit);
  const response = await rpc("eth_simulateV1", () =>
    client.request<HashSimulationRpc>({
      method: "eth_simulateV1",
      params: [
        {
          blockStateCalls: [
            {
              ...(plan.request.stateOverrides !== undefined && {
                stateOverrides: plan.request.stateOverrides,
              }),
              ...(blockGasLimit !== undefined && {
                blockOverrides: { gasLimit: numberToHex(blockGasLimit) },
              }),
              calls: plan.calls.map((call) => {
                const gas = callGas(call, {
                  blockGasLimit,
                  callGasLimit,
                  evidenceGas,
                });
                return {
                  chainId: numberToHex(plan.request.chainId),
                  from: call.transaction.from,
                  to: call.transaction.to,
                  data: call.transaction.data,
                  value: numberToHex(call.transaction.value),
                  ...(gas !== undefined && { gas: numberToHex(gas) }),
                };
              }),
            },
          ],
          traceTransfers: true,
          validation,
        },
        { blockHash: stateBlock.hash, requireCanonical: true },
      ],
    }),
  );

  return evaluateCalls(
    parseSimulationResponse({
      plan,
      blocks: response,
      stateBlockNumber: stateBlock.number,
      stateBlockHash: stateBlock.hash,
      stateBlockTimestamp: stateBlock.timestamp,
      parentHashCheck,
    }),
  );
}
