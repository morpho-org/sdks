import type { MarketId } from "@morpho-org/blue-sdk";
import type { DecodedOperation } from "../../decode/operation.js";
import {
  ConsumerLimitViolationError,
  UnexpectedSimulationError,
} from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import type {
  Fee,
  SimulatedOperation,
  SimulationStateChange,
} from "../../result.js";
import type { Transfer as TxTransfer } from "../../types.js";
import type { ParsedState } from "../state/types.js";
import { checkBlueOperation } from "./blue.js";
import {
  type CheckContext,
  type CheckedOperation,
  checkContext,
  limitsFor,
  operationSubject,
} from "./helpers.js";
import { checkVaultOperation } from "./vault.js";

const unmatched = (ctx: CheckContext, limit: OperationLimit): never => {
  throw new ConsumerLimitViolationError(
    `No verified operation matches operation limit type "${limit.type}"${limit.transactionIndex === undefined ? "" : ` at transaction ${limit.transactionIndex}`}. Check the limit list against the bundle's decoded operations.`,
    {
      context: checkContext(ctx, limit.type, {
        failedTransactionIndex: limit.transactionIndex,
      }),
    },
  );
};

/** Public per-operation record: transaction index plus subject entity keys. @internal */
export const toSimulatedOperation = (
  checked: CheckedOperation,
): SimulatedOperation => ({
  transactionIndex: checked.operation.transactionIndex,
  ...operationSubject(checked.operation),
});

/**
 * Run the per-operation economic checks plus every declared consumer limit
 * (`limits.operations`), inlined on the checked outcome.
 *
 * @returns The checked operations plus the collected conversion/fee records.
 * @throws {UnsupportedOperationError} on a type with no check.
 * @internal
 */
export function checkOperations(params: {
  readonly ctx: CheckContext;
  readonly operations: readonly DecodedOperation[];
  readonly accruedBefore: ParsedState;
  readonly after: ParsedState;
  readonly diff: SimulationStateChange;
  readonly actionDiff: SimulationStateChange;
  readonly transfers: readonly TxTransfer[];
}): {
  readonly operations: readonly CheckedOperation[];
  readonly fees: readonly Fee[];
  readonly touchedMarketIds: ReadonlySet<MarketId>;
} {
  const { ctx, operations, accruedBefore, after, actionDiff } = params;

  const checked: CheckedOperation[] = [];
  const fees: Fee[] = [];
  const touchedMarketIds = new Set<MarketId>();
  const matched = new Set<OperationLimit>();

  for (const operation of operations) {
    switch (operation.type) {
      case "blueSupply":
      case "blueWithdraw":
      case "blueSupplyCollateral":
      case "blueBorrow":
      case "blueSupplyCollateralBorrow":
      case "blueRepay":
      case "blueWithdrawCollateral":
      case "blueRepayWithdrawCollateral":
      case "blueAuthorization": {
        if ("market" in operation)
          touchedMarketIds.add(operation.market.marketId);
        for (const limit of limitsFor(ctx, operation.type, operation))
          matched.add(limit);
        checked.push(
          checkBlueOperation(ctx, operation, accruedBefore, after, actionDiff),
        );
        break;
      }
      case "blueRefinance": {
        touchedMarketIds.add(operation.sourceMarket.marketId);
        touchedMarketIds.add(operation.targetMarket.marketId);
        for (const limit of limitsFor(ctx, operation.type, operation))
          matched.add(limit);
        checked.push(
          checkBlueOperation(ctx, operation, accruedBefore, after, actionDiff),
        );
        break;
      }
      case "vaultV1Deposit":
      case "vaultV2Deposit":
      case "vaultV1Withdraw":
      case "vaultV2Withdraw":
      case "vaultV1Redeem":
      case "vaultV2Redeem":
      case "vaultV1MigrateToV2":
      case "vaultV2ForceWithdraw":
      case "vaultV2ForceRedeem":
      case "vaultV1InKindRedeem":
      case "vaultV2InKindRedeem": {
        if (
          operation.type === "vaultV1InKindRedeem" ||
          operation.type === "vaultV2InKindRedeem"
        )
          for (const leg of operation.markets)
            touchedMarketIds.add(leg.marketId);
        if (operation.type === "vaultV2ForceRedeem")
          for (const leg of operation.deallocations)
            if (leg.marketId != null) touchedMarketIds.add(leg.marketId);
        // The vault's own market allocations legitimately change as deposits
        // are allocated and exits are deallocated.
        for (const vaultAddress of [
          "vault" in operation ? operation.vault : undefined,
          "sourceVault" in operation ? operation.sourceVault : undefined,
          "targetVault" in operation ? operation.targetVault : undefined,
        ]) {
          if (vaultAddress == null) continue;
          for (const allocation of after.internals.vaults.get(vaultAddress)
            ?.allocations ?? [])
            if (allocation.marketId != null)
              touchedMarketIds.add(allocation.marketId);
        }
        const { checked: verified, fee } = checkVaultOperation(
          ctx,
          operation,
          accruedBefore,
          after,
          actionDiff,
        );
        for (const limit of limitsFor(ctx, operation.type, operation))
          matched.add(limit);
        checked.push(verified);
        if (fee != null) fees.push(fee);
        break;
      }
      default: {
        const _exhaustive: never = operation;
        throw new UnexpectedSimulationError(
          `Operation type has no verification contract: ${JSON.stringify(_exhaustive)}`,
          { context: checkContext(ctx, "operation") },
        );
      }
    }
  }

  // Consumer limits are enforced next to the economic checks; limits that
  // matched no operation are rejected after the loop.
  for (const limit of ctx.limits.operations)
    if (!matched.has(limit)) unmatched(ctx, limit);

  return { operations: checked, fees, touchedMarketIds };
}
