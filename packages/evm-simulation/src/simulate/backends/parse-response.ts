import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";
import type { SimulationErrorContext } from "../../errors.js";
import {
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
  SimulationRevertedError,
} from "../../errors.js";
import type { RawLog, SimulationCall } from "../../types.js";
import { decodeNativeBalanceProbe } from "../plan/native-balance-probe.js";
import type { ExecutionPlan } from "../plan/plan-execution.js";

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

/** A user transaction and its normalized result. Only successful calls are carried.
 * @internal
 */
export interface ExecutedTransaction {
  readonly transactionIndex: number;
  readonly result: SimulationCall;
}

/** One decoded native-balance probe reading.
 * @internal
 */
export interface NativeBalanceReading {
  readonly probeId: string;
  readonly phase: "before" | "intermediate" | "after";
  readonly account: Address;
  readonly assets: bigint;
}

/** The output of {@link parseSimulationResponse}: the plan, its block, successful user transactions and probe readings.
 * @internal
 */
export interface SimulationExecution {
  readonly plan: ExecutionPlan;
  readonly block: ExecutionBlock;
  /** User transactions in `transactionIndex` order, successful calls only. */
  readonly transactions: readonly ExecutedTransaction[];
  readonly nativeBalances: readonly NativeBalanceReading[];
}

// RPC quantities are never the empty "0x" — BigInt("0x") would throw.
const isQuantity = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value);
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

// Only the block envelope is checked: per-call fields are trusted — the node
// is the caller's own configured endpoint.
const isSimulateV1Response = (value: unknown): value is RawSimulateV1Response =>
  Array.isArray(value) &&
  value.length === 1 &&
  isObject(value[0]) &&
  isQuantity(readField(value[0], "number")) &&
  isQuantity(readField(value[0], "timestamp")) &&
  typeof readField(value[0], "hash") === "string" &&
  Array.isArray(readField(value[0], "calls"));

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
 *   {@link NativeBalanceReading} per successful probe.
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

  // One pass over the raw calls, split by planned-call kind. Plan order is
  // call order, so transactions land in transactionIndex order.
  const transactions: { transactionIndex: number; result: SimulationCall }[] =
    [];
  const nativeBalances: NativeBalanceReading[] = [];
  // Reason of the first failed user transaction, if any.
  let revertReason: string | undefined;

  for (const [index, call] of block.calls.entries()) {
    const planned = plan.calls[index]!;
    const logs: RawLog[] = (call.logs ?? []).map((log) => ({
      address: log.address,
      topics: log.topics,
      data: log.data ?? "0x",
    }));
    const result: SimulationCall = {
      logs,
      status: call.status === "0x1",
      returnData: call.returnData,
      gasUsed: BigInt(call.gasUsed),
    };

    switch (planned.type) {
      case "transaction": {
        transactions.push({
          transactionIndex: planned.transactionIndex,
          result,
        });
        if (!result.status && revertReason === undefined)
          revertReason = call.error?.message ?? "Simulation failed";
        break;
      }
      case "nativeBalanceProbe": {
        const probeContext: SimulationErrorContext = {
          stage: "transport",
          mode: plan.request.mode,
          chainId: plan.request.chainId,
          blockNumber: params.stateBlockNumber,
        };
        if (!result.status) {
          throw new MissingVerificationEvidenceError(
            `Native balance probe "${planned.probeId}" failed during simulation${call.error?.message !== undefined ? `: ${call.error.message}` : ""}. Re-submit the bundle; if it persists, check that the endpoint honors stateOverrides code.`,
            { context: probeContext },
          );
        }
        const assets = decodeNativeBalanceProbe(call.returnData);
        if (assets === null) {
          throw new MissingVerificationEvidenceError(
            `Native balance probe "${planned.probeId}" returned undecodable data. Check that the endpoint honors the probe code override.`,
            { context: probeContext },
          );
        }
        nativeBalances.push({
          probeId: planned.probeId,
          phase: planned.phase,
          account: planned.account,
          assets,
        });
        break;
      }
    }
  }

  // A user-transaction revert belongs to the bundle, not the boundary.
  if (revertReason !== undefined) {
    throw new SimulationRevertedError(
      revertReason,
      deepFreeze(transactions),
      "UNKNOWN_REVERT",
    );
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
    transactions,
    nativeBalances,
  });
}
