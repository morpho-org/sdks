import { deepFreeze } from "@morpho-org/morpho-ts";
import { BaseError, type Hex, type SimulateBlocksReturnType } from "viem";
import type { SimulationErrorContext } from "../../errors.js";
import {
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
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

type SimulatedCall = SimulateBlocksReturnType[number]["calls"][number];

/** The revert message viem carried on a failed call, trimmed to `shortMessage`. */
const callErrorMessage = (call: SimulatedCall): string | undefined =>
  "error" in call && call.error instanceof BaseError
    ? call.error.shortMessage
    : undefined;

/**
 * Parse a formatted {@link simulateBlocks} result into a
 * {@link SimulationExecution}.
 *
 * The response must be exactly one block at the pinned state block or its
 * immediate successor. Block advancement is node-specific: geth-style nodes
 * simulate on top of `base + 1` while Anvil reports the base block itself —
 * this parser records whatever the node reports in {@link ExecutionBlock}
 * and rejects any other height. Consumers must read
 * `block.blockNumber`/`block.blockTimestamp` and never assume +1.
 *
 * @param params - The plan, the formatted `eth_simulateV1` result, and the
 *   resolved state block.
 * @returns Deep-frozen execution: tagged calls plus one
 *   {@link ExecutedStateRead} per planned state read.
 * @throws {InvalidSimulationResponseError} When the result is not exactly one
 *   block, on a call-count mismatch, or on a simulated block that is neither
 *   the pinned state block nor its immediate successor.
 * @throws {SimulationRevertedError} When a preparation or user-transaction
 *   call failed; the `details` payload carries tagged user call results only.
 * @throws {MissingVerificationEvidenceError} When a planned state read fails.
 * @internal
 */
export function parseSimulationResponse(params: {
  readonly plan: ExecutionPlan;
  readonly blocks: SimulateBlocksReturnType;
  readonly stateBlockNumber: bigint;
  readonly stateBlockHash: Hex;
  readonly stateBlockTimestamp: bigint;
}): SimulationExecution {
  const { plan, blocks } = params;
  const errorContext: SimulationErrorContext = {
    stage: "transport",
    chainId: plan.request.chainId,
    mode: plan.request.mode,
    blockNumber: params.stateBlockNumber,
  };

  const block = blocks[0];
  if (block === undefined || blocks.length !== 1) {
    throw new InvalidSimulationResponseError(
      "eth_simulateV1 returned an unexpected response shape. Check that the configured endpoint implements eth_simulateV1.",
      { context: errorContext },
    );
  }

  const { number: blockNumber, timestamp: blockTimestamp } = block;
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
      address: log.address,
      topics: log.topics,
      data: log.data,
    }));
    const result: SimulationCall = {
      logs,
      status: call.status === "success",
      returnData: call.data,
      gasUsed: call.gasUsed,
    };
    return { planned, result, call };
  });

  // A user-transaction revert belongs to the bundle, not the boundary.
  const failedUserCall = calls.find(
    ({ planned, result }) => planned.type === "transaction" && !result.status,
  );
  if (failedUserCall && failedUserCall.planned.type === "transaction") {
    throw new SimulationRevertedError(
      callErrorMessage(failedUserCall.call) ?? "Simulation failed",
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
    (
      entry,
    ): entry is (typeof calls)[number] & {
      planned: Extract<PlannedCall, { type: "preparation" }>;
    } => entry.planned.type === "preparation" && !entry.result.status,
  );
  if (failedPreparation) {
    const message = callErrorMessage(failedPreparation.call);
    throw new SimulationRevertedError(
      `Authorization preparation call failed during simulation${message !== undefined ? `: ${message}` : ""}. Re-submit the bundle; if it persists, check that the endpoint executes preparation calls.`,
      undefined,
      "UNKNOWN_REVERT",
      {
        stage: "preparation",
        chainId: plan.request.chainId,
        mode: plan.request.mode,
        blockNumber: params.stateBlockNumber,
        authorizationIndex: failedPreparation.planned.authorizationIndex,
        preparationCallIndex: failedPreparation.planned.callIndex,
      },
    );
  }

  const stateReads: ExecutedStateRead[] = [];
  for (const { planned, result, call } of calls) {
    if (planned.type !== "stateRead") continue;
    if (!result.status) {
      const message = callErrorMessage(call);
      throw new MissingVerificationEvidenceError(
        `State read "${planned.read.id}" failed during simulation${message !== undefined ? `: ${message}` : ""}. Re-submit the bundle; if it persists, check that the endpoint executes view calls in the same block.`,
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
      returnData: call.data,
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
