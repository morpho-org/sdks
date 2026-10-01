import { UnexpectedSimulationError } from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import type {
  SimulatedOperation,
  SimulationStateChange,
} from "../../result.js";
import type { ParsedState } from "../state/types.js";
import { checkBlueOperation } from "./blue.js";
import { checkExitOperation } from "./exits.js";
import { type CheckContext, operationSubject } from "./helpers.js";
import { checkRefinanceOperation } from "./refinance.js";
import { checkVaultOperation } from "./vault.js";

/** Public per-operation record: optional transaction index plus subject keys. @internal */
const toSimulatedOperation = (limit: OperationLimit): SimulatedOperation => ({
  ...("transactionIndex" in limit && limit.transactionIndex !== undefined
    ? { transactionIndex: limit.transactionIndex }
    : {}),
  ...operationSubject(limit),
});

/**
 * Run the per-operation economic checks. Each `limits.operations` entry is
 * itself the operation description — type, subject entities and optional
 * `transactionIndex` — and the check verifies the observed before/after state
 * change on that subject, then compares only the entry's pinned
 * `expected*`/`min*`/`max*` fields.
 * @internal
 */
export function checkOperations(params: {
  readonly ctx: CheckContext;
  readonly accruedBefore: ParsedState;
  readonly after: ParsedState;
  readonly actionDiff: SimulationStateChange;
}): { readonly operations: readonly SimulatedOperation[] } {
  const { ctx, accruedBefore, after, actionDiff } = params;
  const operations: SimulatedOperation[] = [];

  for (const limit of ctx.limits.operations) {
    dispatch(ctx, limit, accruedBefore, after, actionDiff);
    operations.push(toSimulatedOperation(limit));
  }

  return { operations };
}

// biome-ignore lint/complexity/useMaxParams: dispatch reads clearest with positional arguments
function dispatch(
  ctx: CheckContext,
  limit: OperationLimit,
  accruedBefore: ParsedState,
  after: ParsedState,
  actionDiff: SimulationStateChange,
): void {
  switch (limit.type) {
    case "blueSupply":
    case "blueWithdraw":
    case "blueSupplyCollateral":
    case "blueBorrow":
    case "blueSupplyCollateralBorrow":
    case "blueRepay":
    case "blueWithdrawCollateral":
    case "blueRepayWithdrawCollateral":
    case "blueAuthorization":
      checkBlueOperation(ctx, limit, accruedBefore, after, actionDiff);
      return;
    case "blueRefinance":
      checkRefinanceOperation(ctx, limit, accruedBefore, after, actionDiff);
      return;
    case "vaultV1Deposit":
    case "vaultV2Deposit":
    case "vaultV1Withdraw":
    case "vaultV2Withdraw":
    case "vaultV1Redeem":
    case "vaultV2Redeem":
      checkVaultOperation(ctx, limit, accruedBefore, after, actionDiff);
      return;
    case "vaultV1MigrateToV2":
    case "vaultV2ForceWithdraw":
    case "vaultV2ForceRedeem":
    case "vaultV1InKindRedeem":
    case "vaultV2InKindRedeem":
      checkExitOperation(ctx, limit, accruedBefore, after, actionDiff);
      return;
    default: {
      const _exhaustive: never = limit;
      throw new UnexpectedSimulationError(
        `No check handles operation limit ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}
