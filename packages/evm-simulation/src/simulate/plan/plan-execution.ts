import { deepFreeze } from "@morpho-org/morpho-ts";
import type {
  ParsedRequest,
  ParsedTransaction,
} from "../request/parse-request.js";

/** One call of an {@link ExecutionPlan}: a user transaction.
 * @internal
 */
interface PlannedTransaction {
  readonly transactionIndex: number;
  readonly transaction: ParsedTransaction;
}

/** The output of {@link planExecution}: the user calls, in order.
 * @internal
 */
export interface ExecutionPlan {
  readonly request: ParsedRequest;
  readonly calls: readonly PlannedTransaction[];
}

/**
 * Plan the execution of a parsed request as ordered `eth_simulateV1` calls.
 *
 * The plan is one call per user transaction, 1:1 and in order, all executed
 * in a single `blockStateCalls` entry: `transactionIndex` matches the
 * caller's transaction position. ETH
 * movements are observed through `traceTransfers` logs on the raw calls, so
 * the plan needs no synthetic calls or `stateOverrides`.
 *
 * @param request - The normalized request produced by `parseRequest`.
 * @returns A deep-frozen {@link ExecutionPlan}; pure — equal inputs produce
 *   structurally equal plans.
 * @internal
 */
export function planExecution(request: ParsedRequest): ExecutionPlan {
  return deepFreeze({
    request,
    calls: request.transactions.map((transaction, i) => ({
      transactionIndex: i,
      transaction,
    })),
  });
}
