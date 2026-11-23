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
      actionType !== "blueRefinance" &&
      actionType !== "erc20Approval" &&
      actionType !== "vaultV1Deposit" &&
      actionType !== "vaultV1MigrateToV2" &&
      actionType !== "vaultV1InKindRedeem" &&
      actionType !== "blueSupply" &&
      actionType !== "blueSupplyCollateral" &&
      actionType !== "blueBorrow" &&
      actionType !== "blueSupplyCollateralBorrow" &&
      actionType !== "blueRepay" &&
      actionType !== "blueWithdraw" &&
      actionType !== "blueWithdrawCollateral" &&
      actionType !== "blueRepayWithdrawCollateral" &&
      actionType !== "morphoAuthorization" &&
      actionType !== "vaultV2Deposit" &&
      actionType !== "vaultV2Withdraw" &&
      actionType !== "vaultV2Redeem" &&
      actionType !== "vaultV2ForceWithdraw" &&
      actionType !== "vaultV2ForceRedeem" &&
      actionType !== "vaultV1Withdraw" &&
      actionType !== "vaultV1Redeem" &&
      actionType !== "vaultV2InKindRedeem"
    ) {
      throw new UnsupportedTransactionPlanActionError(actionType);
    }
  }
}
