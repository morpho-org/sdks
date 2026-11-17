import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";
import {
  InvalidSimulationResponseError,
  SimulationRevertedError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import type { RawLog } from "../../types.js";
import { evaluateAssertion, evaluateLogAssertion } from "../assertions.js";
import type { PlannedCall } from "../plan/plan-execution.js";
import { formatRevert } from "./decode-revert.js";
import type {
  ExecutedStateRead,
  ParsedSimulationResponse,
  SimulationExecution,
} from "./parse-response.js";

/**
 * Check the outcome of every parsed `eth_simulateV1` call, in call order:
 * preparation reverts first, then for each transaction its `assertBefore`
 * checks, its own revert, its `assertLogs` checks on a frozen lowercase copy
 * of its logs, and its `assertAfter` checks; then every planned state read.
 *
 * @param response - The output of `parseSimulationResponse`.
 * @returns Deep-frozen execution: successful calls plus one
 *   {@link ExecutedStateRead} per planned state read.
 * @throws {InvalidSimulationResponseError} When the response lacks a planned
 *   transaction or assertion result, or omits the logs of a transaction with
 *   `assertLogs`.
 * @throws {SimulationAssertError} When an assertion fails or its check throws;
 *   a thrown check error is preserved as `cause`.
 * @throws {SimulationLogAssertError} When an `assertLogs` check returns a
 *   failure message or throws; a thrown check error is kept as `cause`.
 * @throws {SimulationRevertedError} When a preparation or user-transaction
 *   call failed; the error preserves the failing call's original revert bytes.
 * @throws {SlippageCheckUnavailableError} When a planned state read fails.
 * @internal
 */
export function evaluateCalls(
  response: ParsedSimulationResponse,
): SimulationExecution {
  const { plan, block, calls } = response;

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
      { cause: failedPreparation.error },
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
              cause: userCall.error,
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
          if (userCall.logsMissing) {
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
          cause: executedAssertion.error,
          transactionIndex,
          phase,
          assertionIndex,
        });
      }
    }
  }

  const stateReads: ExecutedStateRead[] = [];
  for (const { planned, result, error } of calls) {
    if (planned.type !== "stateRead") continue;
    if (!result.status) {
      throw new SlippageCheckUnavailableError(
        planned.read.kind === "derivation"
          ? `Derivation read "${planned.read.id}" for limits.operations[${planned.read.operationIndex}] failed. Check the operation subject (${planned.read.subject}) and its support for this view call.`
          : `State read "${planned.read.id}" failed during simulation. Re-submit the bundle; if it persists, check that the endpoint executes view calls in the same block.`,
        {
          ...(planned.read.kind === "derivation"
            ? {
                operationIndex: planned.read.operationIndex,
                operationType: planned.read.operationType,
              }
            : {}),
          field: planned.read.id,
          reason: "missingRead",
          cause: error,
        },
      );
    }
    stateReads.push({
      phase: planned.phase,
      read: planned.read,
      returnData: result.returnData,
    });
  }

  return deepFreeze<SimulationExecution>({
    plan,
    block,
    // Every failure was classified above: only successful calls remain.
    calls: calls
      .filter((entry) => entry.result.status)
      .map(({ planned, result, logsMissing }) => ({
        planned,
        result,
        logsMissing,
      })),
    stateReads,
  });
}
