import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";
import {
  InvalidSimulationResponseError,
  SimulationAssertError,
  SimulationLogAssertError,
  type SimulationPackageError,
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
 * Evaluate assertions in call order, then collect failed planned state reads.
 * Integrity failures throw immediately. Reverts are terminal and retain only
 * assertions evaluated before the revert (including its assertBefore checks).
 * @param response - The normalized response.
 * @returns Frozen execution data with collected call-outcome failures.
 * @throws {InvalidSimulationResponseError} When a planned transaction or assertion is missing.
 * @throws {SimulationRevertedError} When a preparation reverts. A transaction
 *   revert returns `reverted` with earlier assertion failures, then the revert.
 * @internal
 */
export function evaluateCalls(
  response: ParsedSimulationResponse,
): SimulationExecution {
  const { plan, block, calls } = response;
  const failures: SimulationPackageError[] = [];
  for (const [
    transactionIndex,
    transaction,
  ] of plan.request.transactions.entries()) {
    if (
      !calls.some(
        ({ planned }) =>
          planned.type === "transaction" &&
          planned.transactionIndex === transactionIndex,
      )
    )
      throw new InvalidSimulationResponseError(
        `eth_simulateV1 plan is missing transaction result ${transactionIndex}.`,
      );
    for (const [phase, assertions] of [
      ["before", transaction.assertBefore],
      ["after", transaction.assertAfter],
    ] as const)
      for (const assertionIndex of (assertions ?? []).keys())
        if (
          !calls.some(
            ({ planned }) =>
              planned.type === "assertion" &&
              planned.transactionIndex === transactionIndex &&
              planned.phase === phase &&
              planned.assertionIndex === assertionIndex,
          )
        )
          throw new InvalidSimulationResponseError(
            `eth_simulateV1 plan is missing assertion result ${transactionIndex}:${phase}:${assertionIndex}.`,
          );
  }

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
          // A revert is terminal: keep only earlier assertion failures, then the revert.
          return Object.freeze({
            ...deepFreeze({ plan, block, calls: [], stateReads: [] }),
            reverted: true,
            failures: Object.freeze([
              ...failures.filter(
                (failure) =>
                  failure instanceof SimulationAssertError ||
                  failure instanceof SimulationLogAssertError,
              ),
              new SimulationRevertedError(
                `Transaction ${transactionIndex} reverted: ${message}`,
                userCall.revertData,
                {
                  cause: userCall.error,
                  transactionIndex,
                },
              ),
            ]),
          });
        }
        if (userCall?.planned.type !== "transaction") {
          throw new InvalidSimulationResponseError(
            `eth_simulateV1 plan is missing transaction result ${transactionIndex}.`,
          );
        }
        const logAssertions = transaction.assertLogs;
        if (logAssertions?.length) {
          if (userCall.logsMissing) {
            failures.push(
              new InvalidSimulationResponseError(
                `eth_simulateV1 omitted logs for transaction ${transactionIndex}. Log assertions cannot be evaluated.`,
              ),
            );
          } else {
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
              const failure = evaluateLogAssertion({
                assertion,
                logs,
                transactionIndex,
                assertionIndex,
              });
              if (failure !== undefined) failures.push(failure);
            }
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
        const failure = evaluateAssertion({
          assertion,
          returnData: executedAssertion.result.returnData,
          status: executedAssertion.result.status,
          revertData: executedAssertion.revertData,
          cause: executedAssertion.error,
          transactionIndex,
          phase,
          assertionIndex,
        });
        if (failure !== undefined) failures.push(failure);
      }
    }
  }

  const stateReads: ExecutedStateRead[] = [];
  const failedReadIds = new Set<string>();
  for (const { planned, result, error } of calls) {
    if (planned.type !== "stateRead") continue;
    if (!result.status) {
      // A read planned in both phases is one cause: report it once.
      if (failedReadIds.has(planned.read.id)) continue;
      failedReadIds.add(planned.read.id);
      failures.push(
        new SlippageCheckUnavailableError(
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
        ),
      );
      continue;
    }
    stateReads.push({
      phase: planned.phase,
      read: planned.read,
      returnData: result.returnData,
    });
  }

  return Object.freeze({
    ...deepFreeze({
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
    }),
    reverted: false,
    failures: Object.freeze(failures),
  });
}
