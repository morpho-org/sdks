import { type Hex, isAddress, isHex } from "viem";
import {
  InvalidSimulationResponseError,
  type SimulationPackageError,
} from "../../errors.js";
import type { RawLog, SimulationCall } from "../../types.js";
import type { ExecutionPlan, PlannedCall } from "../plan/plan-execution.js";
import type { StateRead } from "../state/contract.js";

/** The block coordinates a simulation was pinned to and executed under.
 * @internal
 */
export interface ExecutionBlock {
  readonly chainId: number;
  readonly stateBlockNumber: bigint;
  readonly stateBlockHash: Hex;
  readonly stateBlockTimestamp: bigint;
  readonly blockNumber: bigint;
  readonly blockTimestamp: bigint;
}

/** A planned call and its normalized result. Only successful calls are carried.
 * @internal
 */
interface ExecutedCall {
  readonly planned: PlannedCall;
  readonly result: SimulationCall;
  readonly logsMissing: boolean;
}

/** One executed state read with its raw return data. @internal */
export interface ExecutedStateRead {
  readonly phase: "before" | "after";
  readonly read: StateRead;
  readonly returnData: Hex;
}

/** The output of `evaluateCalls`: the plan, its block, successful calls and state reads.
 * @internal
 */
export interface SimulationExecution {
  readonly plan: ExecutionPlan;
  readonly block: ExecutionBlock;
  /** A transaction reverted; nothing after the revert may be checked. */
  readonly reverted: boolean;
  /** Post-execution failures, in call-outcome order. */
  readonly failures: readonly SimulationPackageError[];
  readonly calls: readonly ExecutedCall[];
  /** Successful state reads, in plan order, tagged by phase. */
  readonly stateReads: readonly ExecutedStateRead[];
}

/** A planned call with its normalized result and the node's failure details, before any call outcome is checked.
 * @internal
 */
interface ParsedCall {
  readonly planned: PlannedCall;
  readonly result: SimulationCall;
  /** The node's `error.data` when it is non-empty hex, otherwise `returnData`. */
  readonly revertData: Hex;
  /** The node's per-call `error` object, kept as the `cause` of a failed call. */
  readonly error:
    | { readonly message?: string; readonly data?: unknown }
    | undefined;
  readonly logsMissing: boolean;
}

/** The output of {@link parseSimulationResponse}: the plan, its block and every call, including failed ones.
 * @internal
 */
export interface ParsedSimulationResponse {
  readonly plan: ExecutionPlan;
  readonly block: ExecutionBlock;
  readonly calls: readonly ParsedCall[];
}

const isQuantity = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value);
const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const readField = (object: object, key: string): unknown =>
  Reflect.get(object, key);

interface RawCallResult {
  readonly status: "0x0" | "0x1";
  readonly returnData: Hex;
  readonly gasUsed: string;
  readonly logs?: readonly RawLog[];
  readonly error?: { readonly message?: string; readonly data?: unknown };
}

interface RawBlockResult {
  readonly number: string;
  readonly timestamp: string;
  readonly hash: Hex;
  readonly parentHash?: Hex;
  readonly calls: readonly RawCallResult[];
}

const isSimulateV1Response = (
  value: unknown,
): value is readonly [RawBlockResult] =>
  Array.isArray(value) &&
  value.length === 1 &&
  isObject(value[0]) &&
  isQuantity(readField(value[0], "number")) &&
  isQuantity(readField(value[0], "timestamp")) &&
  isHex(readField(value[0], "hash")) &&
  Array.isArray(readField(value[0], "calls"));

/**
 * Parse a raw `eth_simulateV1` result into a
 * {@link ParsedSimulationResponse}. The parser only checks the response's
 * integrity; `evaluateCalls` then checks reverts, assertions and state
 * reads in call order.
 *
 * The response must be exactly one block at the pinned state block or its
 * immediate successor. Block advancement is node-specific: geth-style nodes
 * simulate on top of `base + 1` while Anvil reports the base block itself —
 * this parser records whatever the node reports in {@link ExecutionBlock}
 * and rejects any other height. Consumers must read
 * `block.blockNumber`/`block.blockTimestamp` and never assume +1.
 *
 * @param params - The plan, the raw `eth_simulateV1` result, and the
 *   resolved state block.
 * @returns The executed block and every planned call with its normalized
 *   result, revert data and node error, in plan order.
 * @throws {InvalidSimulationResponseError} When the result is not exactly one
 *   block, on a call-count mismatch, a malformed per-call result, or on a
 *   simulated block that is neither the pinned state block nor its immediate
 *   successor.
 * @internal
 */
export function parseSimulationResponse(params: {
  readonly plan: ExecutionPlan;
  readonly blocks: unknown;
  readonly stateBlockNumber: bigint;
  readonly stateBlockHash: Hex;
  readonly stateBlockTimestamp: bigint;
  readonly parentHashCheck: boolean;
}): ParsedSimulationResponse {
  const { plan, blocks } = params;

  if (!isSimulateV1Response(blocks)) {
    throw new InvalidSimulationResponseError(
      "eth_simulateV1 returned an unexpected response shape. Check that the configured endpoint implements eth_simulateV1.",
    );
  }

  const block = blocks[0];
  const blockNumber = BigInt(block.number);
  const blockTimestamp = BigInt(block.timestamp);
  if (
    blockNumber !== params.stateBlockNumber &&
    blockNumber !== params.stateBlockNumber + 1n
  ) {
    throw new InvalidSimulationResponseError(
      `eth_simulateV1 reported block ${blockNumber} but the pinned state block is ${params.stateBlockNumber}; the node did not honor the pinned block.`,
    );
  }
  // Anvil re-hashes the pinned block, so only the geth-style successor can be
  // pinned by hash: it must report a parentHash (geth always does) equal to
  // the pinned state block hash. With `parentHashCheck` off (Stable by
  // default) the block number and timestamp checks still apply.
  if (
    params.parentHashCheck &&
    blockNumber === params.stateBlockNumber + 1n &&
    block.parentHash !== params.stateBlockHash
  ) {
    throw new InvalidSimulationResponseError(
      `eth_simulateV1 reported block ${blockNumber} whose parent ${String(block.parentHash)} is not the pinned state block hash ${params.stateBlockHash}; the node did not simulate on top of the pinned block.`,
    );
  }
  if (blockTimestamp < params.stateBlockTimestamp) {
    throw new InvalidSimulationResponseError(
      `eth_simulateV1 reported block timestamp ${blockTimestamp}, behind the pinned state block timestamp ${params.stateBlockTimestamp}. Check that the endpoint executes on top of the requested block.`,
    );
  }

  if (block.calls.length !== plan.calls.length) {
    throw new InvalidSimulationResponseError(
      `eth_simulateV1 returned ${block.calls.length} call result(s) for ${plan.calls.length} planned call(s). Refusing to map the response with mismatched lengths.`,
    );
  }

  const calls = block.calls.map((call, index): ParsedCall => {
    const planned = plan.calls[index]!;
    let result: SimulationCall;
    try {
      if (
        !isObject(call) ||
        (call.status !== "0x0" && call.status !== "0x1") ||
        !isHex(call.returnData) ||
        !isQuantity(call.gasUsed) ||
        (call.logs != null && !Array.isArray(call.logs))
      )
        throw new InvalidSimulationResponseError(
          `eth_simulateV1 returned a malformed call result at position ${index}.`,
        );
      result = {
        logs:
          call.logs == null
            ? []
            : call.logs.map((log): RawLog => {
                if (
                  !isAddress(log.address) ||
                  !Array.isArray(log.topics) ||
                  log.topics.some(
                    (topic: unknown) => !isHex(topic) || topic.length !== 66,
                  ) ||
                  (log.data !== undefined && !isHex(log.data))
                )
                  throw new InvalidSimulationResponseError(
                    `eth_simulateV1 returned a malformed log at call position ${index}.`,
                  );
                return {
                  address: log.address,
                  topics: log.topics,
                  data: log.data ?? "0x",
                };
              }),
        status: call.status === "0x1",
        returnData: call.returnData,
        gasUsed: BigInt(call.gasUsed),
      };
    } catch (cause) {
      if (cause instanceof InvalidSimulationResponseError) throw cause;
      throw new InvalidSimulationResponseError(
        `eth_simulateV1 returned a malformed call result at position ${index}.`,
        { cause },
      );
    }
    // geth and Anvil return revert data in `error.data`, with `returnData` empty.
    const revertData =
      isHex(call.error?.data) && call.error.data !== "0x"
        ? call.error.data
        : call.returnData;
    return {
      planned,
      result,
      revertData,
      error: call.error,
      logsMissing: call.logs == null,
    };
  });

  return {
    plan,
    block: {
      chainId: plan.request.chainId,
      stateBlockNumber: params.stateBlockNumber,
      stateBlockHash: params.stateBlockHash,
      stateBlockTimestamp: params.stateBlockTimestamp,
      blockNumber,
      blockTimestamp,
    },
    calls,
  };
}
