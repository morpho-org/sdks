import { UnsupportedTransactionPlanActionError } from "./error.js";
import type { Step } from "./types.js";

/**
 * @internal Rejects unknown action types before interpreting requests or updates.
 * @param steps - Steps whose action discriminators must be supported.
 * @returns Nothing when every action type is supported.
 * @throws {UnsupportedTransactionPlanActionError} when any step names an unsupported action type.
 */
export function validateTransactionPlanActions(steps: readonly Step[]): void {
  for (const step of steps) {
    const actionType = step.action.type;
    if (
      actionType !== "erc20Approval" &&
      actionType !== "vaultV2Deposit" &&
      actionType !== "vaultV2Withdraw"
    )
      throw new UnsupportedTransactionPlanActionError(actionType);
  }
}
