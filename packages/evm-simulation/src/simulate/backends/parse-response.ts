import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, type Hex, isAddress, isHex } from "viem";
import type { SimulationErrorContext } from "../../errors.js";
import {
  InvalidSimulationResponseError,
  SimulationRevertedError,
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
export interface ExecutedCall {
  readonly planned: PlannedCall;
  readonly result: SimulationCall;
}

/** One executed state read with its raw return data. @internal */
interface ExecutedStateRead {
  readonly phase: "before" | "after";
  readonly read: StateRead;
  readonly returnData: Hex;
}

/** The output of {@link parseSimulationResponse}: the plan, its block, successful calls and probe readings.
 * @internal
 */
export interface SimulationExecution {
  readonly plan: ExecutionPlan;
  readonly block: ExecutionBlock;
  readonly calls: readonly ExecutedCall[];
  /** Successful state reads, in plan order, tagged by phase. */
  readonly stateReads: readonly ExecutedStateRead[];
}

// RPC quantities are never the empty "0x" — BigInt("0x") would throw.
const isQuantity = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value);
const isBytes32 = (value: unknown): value is Hex =>
  typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const readField = (object: object, key: string): unknown =>
  Reflect.get(object, key);

interface RawLogEntry {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data?: Hex;
}

interface RawCallResult {
  readonly status: "0x0" | "0x1";
  readonly returnData: Hex;
  readonly gasUsed: string;
  readonly logs?: readonly RawLogEntry[];
  readonly error?: {
    readonly code?: number;
    readonly message?: string;
    readonly data?: unknown;
  };
}

interface RawBlockResult {
  readonly number: string;
  readonly timestamp: string;
  readonly hash: Hex;
  readonly parentHash?: Hex;
  readonly calls: readonly RawCallResult[];
}

/** Raw `eth_simulateV1` result: exactly one simulated block. */
type RawSimulateV1Response = readonly [RawBlockResult];

const isSimulateV1Response = (
  value: unknown,
): value is RawSimulateV1Response => {
  if (!Array.isArray(value) || value.length !== 1 || !isObject(value[0]))
    return false;
  const block = value[0];
  if (
    !isQuantity(readField(block, "number")) ||
    !isQuantity(readField(block, "timestamp")) ||
    !isBytes32(readField(block, "hash")) ||
    (readField(block, "parentHash") !== undefined &&
      !isBytes32(readField(block, "parentHash")))
  )
    return false;
  const calls = readField(block, "calls");
  if (!Array.isArray(calls)) return false;
  return calls.every((call) => {
    if (!isObject(call)) return false;
    const status = readField(call, "status");
    if (
      (status !== "0x0" && status !== "0x1") ||
      !isHex(readField(call, "returnData")) ||
      !isQuantity(readField(call, "gasUsed"))
    )
      return false;
    const logs = readField(call, "logs");
    if (
      logs !== undefined &&
      (!Array.isArray(logs) ||
        !logs.every((log) => {
          if (!isObject(log)) return false;
          const topics = readField(log, "topics");
          const data = readField(log, "data");
          const address = readField(log, "address");
          return (
            typeof address === "string" &&
            isAddress(address) &&
            Array.isArray(topics) &&
            topics.every(isBytes32) &&
            (data === undefined || isHex(data))
          );
        }))
    )
      return false;
    const error = readField(call, "error");
    if (error !== undefined) {
      if (!isObject(error)) return false;
      const code = readField(error, "code");
      const message = readField(error, "message");
      if (
        (code !== undefined && !Number.isInteger(code)) ||
        (message !== undefined && typeof message !== "string")
      )
        return false;
    }
    return true;
  });
};

/**
 * Parse a raw `eth_simulateV1` response into a {@link SimulationExecution}.
 *
 * The response must be exactly one block at the pinned state block or its
 * immediate successor. Block advancement is node-specific: geth-style nodes
 * simulate on top of `base + 1` while Anvil reports the base block itself —
 * this parser records whatever the node reports in {@link ExecutionBlock}
 * and rejects any other height. Consumers must read
 * `block.blockNumber`/`block.blockTimestamp` and never assume +1.
 *
 * @param params - The plan, the raw RPC `result`, and the resolved state block.
 * @returns Deep-frozen execution: tagged calls plus one
 *   {@link ExecutedStateRead} per planned state read.
 * @throws {InvalidSimulationResponseError} On any shape violation, a call-count
 *   mismatch, or a simulated block that is neither the pinned state block nor
 *   its immediate successor.
 * @throws {SimulationRevertedError} When a user-transaction call failed; the
 *   `details` payload carries the tagged user call results only.
 * @throws {MissingVerificationEvidenceError} When a probe call failed or its
 *   return data cannot be decoded.
 * @internal
 */
export function parseSimulationResponse(params: {
  readonly plan: ExecutionPlan;
  readonly response: unknown;
  readonly stateBlockNumber: bigint;
  readonly stateBlockHash: Hex;
  readonly stateBlockTimestamp: bigint;
}): SimulationExecution {
  const { plan, response } = params;
  const errorContext: SimulationErrorContext = {
    stage: "transport",
    chainId: plan.request.chainId,
    mode: plan.request.mode,
    blockNumber: params.stateBlockNumber,
  };

  if (!isSimulateV1Response(response)) {
    throw new InvalidSimulationResponseError(
      "eth_simulateV1 returned an unexpected response shape. Check that the configured endpoint implements eth_simulateV1.",
      { context: errorContext },
    );
  }

  const block = response[0];
  const blockNumber = BigInt(block.number);
  const blockTimestamp = BigInt(block.timestamp);
  if (
    blockNumber !== params.stateBlockNumber &&
    blockNumber !== params.stateBlockNumber + 1n
  ) {
    throw new InvalidSimulationResponseError(
      `eth_simulateV1 reported block ${blockNumber} but the pinned state block is ${params.stateBlockNumber}; the node did not honor the pinned block.`,
      { context: errorContext },
    );
  }
  // Anvil re-hashes the pinned block, so only the geth-style successor can be
  // pinned by hash: it must report a parentHash (geth always does) equal to
  // the pinned state block hash.
  if (
    blockNumber === params.stateBlockNumber + 1n &&
    block.parentHash !== params.stateBlockHash
  ) {
    throw new InvalidSimulationResponseError(
      `eth_simulateV1 reported block ${blockNumber} whose parent ${String(block.parentHash)} is not the pinned state block hash ${params.stateBlockHash}; the node did not simulate on top of the pinned block.`,
      { context: errorContext },
    );
  }
  if (blockTimestamp < params.stateBlockTimestamp) {
    throw new InvalidSimulationResponseError(
      `eth_simulateV1 reported block timestamp ${blockTimestamp}, behind the pinned state block timestamp ${params.stateBlockTimestamp}. Check that the endpoint executes on top of the requested block.`,
      { context: errorContext },
    );
  }

  if (block.calls.length !== plan.calls.length) {
    throw new InvalidSimulationResponseError(
      `eth_simulateV1 returned ${block.calls.length} call result(s) for ${plan.calls.length} planned call(s). Refusing to map the response with mismatched lengths.`,
      { context: errorContext },
    );
  }

  const calls = block.calls.map((call, index) => {
    const planned = plan.calls[index]!;
    const logs: RawLog[] = (call.logs ?? []).map((log) => ({
      address: log.address as Address,
      topics: log.topics as readonly Hex[],
      data: (log.data ?? "0x") as Hex,
    }));
    const result: SimulationCall = {
      logs,
      status: call.status === "0x1",
      returnData: call.returnData as Hex,
      gasUsed: BigInt(call.gasUsed),
    };
    return { planned, result, call };
  });

  // A user-transaction revert belongs to the bundle, not the boundary.
  const failedUserCall = calls.find(
    ({ planned, result }) => planned.type === "transaction" && !result.status,
  );
  if (failedUserCall && failedUserCall.planned.type === "transaction") {
    throw new SimulationRevertedError(
      failedUserCall.call.error?.message ?? "Simulation failed",
      deepFreeze(
        calls
          .filter(
            (
              entry,
            ): entry is typeof entry & {
              planned: PlannedCall & {
                type: "transaction";
                transactionIndex: number;
              };
            } => entry.planned.type === "transaction",
          )
          .map(({ planned, result }) => ({
            transactionIndex: planned.transactionIndex,
            result,
          })),
      ),
      "UNKNOWN_REVERT",
    );
  }

  // A preparation call that reverted did not produce its promised state.
  const failedPreparation = calls.find(
    ({ planned, result }) => planned.type === "preparation" && !result.status,
  );
  if (failedPreparation) {
    throw new InvalidSimulationResponseError(
      `Authorization preparation call failed during simulation${failedPreparation.call.error?.message !== undefined ? `: ${failedPreparation.call.error.message}` : ""}. Re-submit the bundle; if it persists, check that the endpoint executes preparation calls.`,
      {
        context: {
          stage: "preparation",
          chainId: plan.request.chainId,
          mode: plan.request.mode,
          blockNumber: params.stateBlockNumber,
          authorizationIndex:
            failedPreparation.planned.type === "preparation"
              ? failedPreparation.planned.authorizationIndex
              : -1,
          ...(failedPreparation.planned.type === "preparation"
            ? { preparationCallIndex: failedPreparation.planned.callIndex }
            : {}),
        },
      },
    );
  }

  const stateReads: ExecutedStateRead[] = [];
  for (const { planned, result, call } of calls) {
    if (planned.type !== "stateRead") continue;
    if (!result.status) {
      throw new InvalidSimulationResponseError(
        `State read "${planned.read.id}" failed during simulation${call.error?.message !== undefined ? `: ${call.error.message}` : ""}. Re-submit the bundle; if it persists, check that the endpoint executes view calls in the same block.`,
        {
          context: {
            stage: "verification",
            chainId: plan.request.chainId,
            mode: plan.request.mode,
            blockNumber: params.stateBlockNumber,
            field: planned.read.id,
          },
        },
      );
    }
    stateReads.push({
      phase: planned.phase,
      read: planned.read,
      returnData: call.returnData as Hex,
    });
  }

  return deepFreeze<SimulationExecution>({
    plan,
    block: {
      chainId: plan.request.chainId,
      stateBlockNumber: params.stateBlockNumber,
      stateBlockHash: params.stateBlockHash,
      stateBlockTimestamp: params.stateBlockTimestamp,
      blockNumber,
      blockTimestamp,
    },
    // Every failure was classified above: only successful calls remain.
    calls: calls
      .filter((entry) => entry.result.status)
      .map(({ planned, result }) => ({ planned, result })),
    stateReads,
  });
}
