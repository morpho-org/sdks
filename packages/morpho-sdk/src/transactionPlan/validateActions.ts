import { UnsupportedTransactionPlanActionError } from "./error.js";
import { validateSignaturelessMidnightAction } from "./midnight/authorization.js";
import type { Step } from "./types.js";

/**
 * @internal Rejects unknown action types, and Midnight steps carrying a signature-request map,
 * before interpreting requests or updates.
 * @param steps - Steps whose action discriminators must be supported.
 * @returns Nothing when every action type is supported.
 * @throws {UnsupportedTransactionPlanActionError} when any step names an unsupported action type.
 * @throws {InvalidTransactionPlanError} when a Midnight step carries `signatureRequestIds`, as restore does.
 */
export function validateTransactionPlanActions(steps: readonly Step[]): void {
  for (const [index, step] of steps.entries()) {
    const actionType = step.action.type;
    if (
      actionType !== "midnightRedeem" &&
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
      actionType !== "blueWithdrawBuyCallback" &&
      actionType !== "blueRepayWithdrawCollateral" &&
      actionType !== "morphoAuthorization" &&
      actionType !== "midnightAuthorization" &&
      actionType !== "midnightMakeBorrow" &&
      actionType !== "midnightMakeLend" &&
      actionType !== "midnightMakeRepay" &&
      actionType !== "midnightMakeWithdraw" &&
      actionType !== "midnightSupplyBlueMakeLend" &&
      actionType !== "midnightSupplyCollateralMakeBorrow" &&
      actionType !== "midnightTakeBorrow" &&
      actionType !== "midnightSupplyCollateralTakeBorrow" &&
      actionType !== "midnightTakeLend" &&
      actionType !== "midnightTakeRepayWithdrawCollateral" &&
      actionType !== "midnightTakeWithdraw" &&
      actionType !== "midnightRepayWithdrawCollateral" &&
      actionType !== "midnightSupplyCollateral" &&
      actionType !== "midnightSupplyCollateralWithNative" &&
      actionType !== "midnightSupplyCollateralBatch" &&
      actionType !== "midnightWithdrawCollateral" &&
      actionType !== "midnightWithdrawCollateralBatch" &&
      actionType !== "midnightCancelOffers" &&
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
    if (actionType.startsWith("midnight")) {
      // Every Midnight step is signatureless: build and inspection reject the maps restore rejects.
      validateSignaturelessMidnightAction(
        step.action,
        `$.steps[${index}].action`,
      );
    }
  }
}
