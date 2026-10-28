import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, type Hex, isAddress, isHex } from "viem";
import {
  InvalidSimulationResponseError,
  SimulationRevertedError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import type { RawLog, SimulationCall } from "../../types.js";
import { evaluateAssertion, evaluateLogAssertion } from "../assertions.js";
import type { ExecutionPlan, PlannedCall } from "../plan/plan-execution.js";
import type { StateRead } from "../state/contract.js";
import { formatRevert } from "./decode-revert.js";

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
}

/** One executed state read with its raw return data. @internal */
interface ExecutedStateRead {
  readonly phase: "before" | "after";
  readonly read: StateRead;
  readonly returnData: Hex;
}

/** The output of {@link parseSimulationResponse}: the plan, its block, successful calls and state reads.
 * @internal
 */
export interface SimulationExecution {
  readonly plan: ExecutionPlan;
  readonly block: ExecutionBlock;
  readonly calls: readonly ExecutedCall[];
  /** Successful state reads, in plan order, tagged by phase. */
  readonly stateReads: readonly ExecutedStateRead[];
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
 * {@link SimulationExecution}.
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
 * @returns Deep-frozen execution: tagged calls plus one
 *   {@link ExecutedStateRead} per planned state read.
 * @throws {InvalidSimulationResponseError} When the result is not exactly one
 *   block, on a call-count mismatch, a malformed per-call result, or on a
 *   transaction with `assertLogs` whose logs are omitted, or on a simulated
 *   block that is neither the pinned state block nor its immediate successor.
 * @throws {SimulationAssertError} When an assertion fails or its check throws;
 *   a thrown check error is preserved as `cause`.
 * @throws {SimulationLogAssertError} When an `assertLogs` check returns a
 *   failure message or throws; a thrown check error is kept as `cause`.
 * @throws {SimulationRevertedError} When a preparation or user-transaction
 *   call failed; the error preserves the failing call's original revert bytes.
 * @throws {SlippageCheckUnavailableError} When a planned state read fails.
 * @internal
 */
export function parseSimulationResponse(params: {
  readonly plan: ExecutionPlan;
  readonly blocks: unknown;
  readonly stateBlockNumber: bigint;
  readonly stateBlockHash: Hex;
  readonly stateBlockTimestamp: bigint;
  readonly parentHashCheck: boolean;
}): SimulationExecution {
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

  const calls = block.calls.map((call, index) => {
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
        logs: (call.logs ?? []).map((log): RawLog => {
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
    return { planned, result, call, revertData };
  });

  // A preparation call that reverted did not produce its promised state —
  // it is reported before user-transaction reverts it caused.
  const failedPreparation = calls.find(
    (
      entry,
    ): entry is (typeof calls)[number] & {
      planned: Extract<PlannedCall, { type: "preparation" }>;
    } => entry.planned.type === "preparation" && !entry.result.status,
  );
  if (failedPreparation) {
    const { planned, revertData } = failedPreparation;
    const message = formatRevert(revertData) ?? "Revert reason unavailable";
    throw new SimulationRevertedError(
      `Authorization ${planned.authorizationIndex} preparation call ${planned.callIndex} reverted: ${message}`,
      revertData,
      { cause: failedPreparation.call.error },
    );
  }

  for (const [
    transactionIndex,
    transaction,
  ] of plan.request.transactions.entries()) {
    for (const [phase, assertions] of [
      ["before", transaction.assertBefore],
      ["after", transaction.assertAfter],
    ] as const) {
      if (phase === "after") {
        const userCall = calls.find(
          ({ planned }) =>
            planned.type === "transaction" &&
            planned.transactionIndex === transactionIndex,
        );
        if (
          userCall?.planned.type === "transaction" &&
          !userCall.result.status
        ) {
          const message =
            formatRevert(userCall.revertData) ?? "Revert reason unavailable";
          throw new SimulationRevertedError(
            `Transaction ${transactionIndex} reverted: ${message}`,
            userCall.revertData,
            {
              cause: userCall.call.error,
              transactionIndex,
            },
          );
        }
        if (userCall?.planned.type !== "transaction") {
          throw new InvalidSimulationResponseError(
            `eth_simulateV1 plan is missing transaction result ${transactionIndex}.`,
          );
        }
        const logAssertions = transaction.assertLogs;
        if (logAssertions?.length) {
          if (!Array.isArray(userCall.call.logs)) {
            throw new InvalidSimulationResponseError(
              `eth_simulateV1 omitted logs for transaction ${transactionIndex}. Log assertions cannot be evaluated.`,
            );
          }
          const logs = deepFreeze(
            userCall.result.logs.map(
              (log): RawLog => ({
                address: log.address.toLowerCase() as Address,
                topics: log.topics.map((topic) => topic.toLowerCase() as Hex),
                data: log.data.toLowerCase() as Hex,
              }),
            ),
          );
          for (const [assertionIndex, assertion] of logAssertions.entries()) {
            evaluateLogAssertion({
              assertion,
              logs,
              transactionIndex,
              assertionIndex,
            });
          }
        }
      }

      for (const [assertionIndex, assertion] of (assertions ?? []).entries()) {
        const executedAssertion = calls.find(
          ({ planned }) =>
            planned.type === "assertion" &&
            planned.transactionIndex === transactionIndex &&
            planned.phase === phase &&
            planned.assertionIndex === assertionIndex,
        );
        if (executedAssertion?.planned.type !== "assertion") {
          throw new InvalidSimulationResponseError(
            `eth_simulateV1 plan is missing assertion result ${transactionIndex}:${phase}:${assertionIndex}.`,
          );
        }
        evaluateAssertion({
          assertion,
          returnData: executedAssertion.result.returnData,
          status: executedAssertion.result.status,
          revertData: executedAssertion.revertData,
          cause: executedAssertion.call.error,
          transactionIndex,
          phase,
          assertionIndex,
        });
      }
    }
  }

  const stateReads: ExecutedStateRead[] = [];
  for (const { planned, result, call } of calls) {
    if (planned.type !== "stateRead") continue;
    if (!result.status) {
      throw new SlippageCheckUnavailableError(
        planned.read.kind === "derivation"
          ? `Derivation read "${planned.read.id}" for limits.operations[${planned.read.operationIndex}] failed. Check the operation subject (${planned.read.subject}) and its support for this view call.`
          : `State read "${planned.read.id}" failed during simulation. Re-submit the bundle; if it persists, check that the endpoint executes view calls in the same block.`,
        { cause: call.error },
      );
    }
    stateReads.push({
      phase: planned.phase,
      read: planned.read,
      returnData: call.returnData,
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
