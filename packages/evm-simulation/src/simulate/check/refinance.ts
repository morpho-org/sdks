import { MathLib } from "@morpho-org/blue-sdk";
import type { DecodedOperation } from "../../decode/operation.js";
import {
  MarketConstraintViolationError,
  ProtocolBindingMismatchError,
  SlippageLimitExceededError,
} from "../../errors.js";
import type { SimulationStateChange } from "../../result.js";
import type { ParsedState } from "../state/types.js";
import {
  type CheckContext,
  type CheckedOperation,
  eq,
  fail,
  findMarket,
  findPosition,
  opContext,
  riskOn,
  toMarketEntity,
} from "./helpers.js";

/**
 * Verify `blueRefinance` against the decoded bindings.
 *
 * Source market: borrow shares and collateral must drain to exactly zero.
 * Target market: collateral must equal the moved source collateral exactly,
 * and the minted borrow shares must equal `toBorrowShares(newDebt, "Up")`
 * where `newDebt` is the repaid source debt plus the decoded reallocation
 * penalty. Wallet: the owner's net loan-token change must be within the
 * slippage-bounded dust of the new debt.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: checks read clearest with positional arguments
export function checkRefinanceOperation(
  ctx: CheckContext,
  operation: Extract<DecodedOperation, { type: "blueRefinance" }>,
  accruedBefore: ParsedState,
  after: ParsedState,
  actionDiff?: SimulationStateChange,
): CheckedOperation {
  const sourceMarket = operation.sourceMarket;
  const targetMarket = operation.targetMarket;
  if (!after.markets.some((m) => m.marketId === sourceMarket.marketId))
    throw new ProtocolBindingMismatchError(
      `Refinance source market "${sourceMarket.marketId}" is not in the verified market set`,
      { context: opContext(ctx, operation) },
    );
  if (!after.markets.some((m) => m.marketId === targetMarket.marketId))
    throw new ProtocolBindingMismatchError(
      `Refinance target market "${targetMarket.marketId}" is not in the verified market set`,
      { context: opContext(ctx, operation) },
    );

  const sourceBefore = findPosition(
    accruedBefore,
    sourceMarket.marketId,
    operation.onBehalf,
    ctx,
    operation,
  );
  const sourceAfter = findPosition(
    after,
    sourceMarket.marketId,
    operation.onBehalf,
    ctx,
    operation,
  );
  const targetBefore = findPosition(
    accruedBefore,
    targetMarket.marketId,
    operation.onBehalf,
    ctx,
    operation,
  );
  const targetAfter = findPosition(
    after,
    targetMarket.marketId,
    operation.onBehalf,
    ctx,
    operation,
  );

  // Source must fully close.
  if (sourceAfter.borrowShares !== 0n || sourceAfter.collateral !== 0n)
    fail(
      ctx,
      operation,
      `Refinance source ${sourceMarket.marketId} retains borrow shares "${sourceAfter.borrowShares}" or collateral "${sourceAfter.collateral}" after a full close`,
    );

  const sourceMarketBefore = findMarket(
    accruedBefore,
    sourceMarket.marketId,
    ctx,
    operation,
  );
  const sourceInternals = accruedBefore.internals.markets.get(
    sourceMarket.marketId,
  );
  if (sourceInternals == null)
    return fail(
      ctx,
      operation,
      `Refinance source market "${sourceMarket.marketId}" internals missing`,
    );
  const sourceEntity = toMarketEntity(sourceMarketBefore, sourceInternals);
  const repaidAssets = sourceEntity.toBorrowAssets(
    sourceBefore.borrowShares,
    "Up",
  );
  const penaltyAssets = operation.reallocations.reduce(
    (total, r) => total + MathLib.wMulUp(r.assets, r.penaltyWad),
    0n,
  );
  const newDebt = repaidAssets + penaltyAssets;

  // Target collateral must equal the moved source collateral exactly.
  if (
    targetAfter.collateral !==
    targetBefore.collateral + sourceBefore.collateral
  )
    fail(
      ctx,
      operation,
      `Target collateral "${targetAfter.collateral}", expected "${targetBefore.collateral + sourceBefore.collateral}" (moved "${sourceBefore.collateral}")`,
    );

  const targetMarketAfter = findMarket(
    after,
    targetMarket.marketId,
    ctx,
    operation,
  );
  const targetInternals = after.internals.markets.get(targetMarket.marketId);
  if (targetInternals == null)
    return fail(
      ctx,
      operation,
      `Refinance target market "${targetMarket.marketId}" internals missing`,
    );
  const targetEntity = toMarketEntity(targetMarketAfter, targetInternals);
  const expectedShares = targetEntity.toBorrowShares(newDebt, "Up");
  const minted = targetAfter.borrowShares - targetBefore.borrowShares;
  if (minted !== expectedShares)
    fail(
      ctx,
      operation,
      `Target borrow shares minted "${minted}", expected "${expectedShares}" for debt "${newDebt}"`,
    );

  // Target LTV bound.
  const risk = riskOn(targetAfter, targetEntity);
  if (targetAfter.borrowShares > 0n) {
    if (targetAfter.collateral === 0n)
      throw new MarketConstraintViolationError(
        `Refinance target ${targetMarket.marketId} holds debt with zero collateral`,
        { context: opContext(ctx, operation) },
      );
    if (risk.ltvWad.type === "finite") {
      const bound = targetMarket.params.lltv - ctx.limits.minLltvBufferWad;
      if (risk.ltvWad.valueWad > bound)
        throw new MarketConstraintViolationError(
          `Refinance target LTV "${risk.ltvWad.valueWad}" exceeds LLTV "${targetMarket.params.lltv}" minus buffer "${ctx.limits.minLltvBufferWad}"`,
          { context: opContext(ctx, operation) },
        );
    }
  }

  // Owner net loan-token change must be zero beyond modeled dust.
  const loanToken = targetMarket.params.loanToken;
  const netLoan = (actionDiff?.balances ?? [])
    .filter((c) => eq(c.account, operation.onBehalf) && eq(c.token, loanToken))
    .reduce((total, c) => total + c.assets, 0n);
  const loanDust = netLoan < 0n ? -netLoan : netLoan;
  const dustBound = MathLib.wMulUp(newDebt, ctx.limits.maxSlippageWad);
  if (loanDust > dustBound)
    throw new SlippageLimitExceededError(
      `Refinance loan dust "${loanDust}" exceeds the slippage bound "${dustBound}" (${ctx.limits.maxSlippageWad} WAD of new debt "${newDebt}")`,
      { context: opContext(ctx, operation) },
    );

  return {
    operation,
    outcome: {
      targetBorrowAssets: newDebt,
      targetBorrowSharesMinted: minted,
      sourceResidualBorrowShares: sourceAfter.borrowShares,
      targetLtvAfterWad: risk.ltvWad,
      targetHealthFactorAfterWad: risk.healthFactorWad,
      loanDustAssets: loanDust,
      reallocationPenaltyAssets: penaltyAssets,
    },
  } as CheckedOperation;
}
