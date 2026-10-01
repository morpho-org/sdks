import { MarketConstraintViolationError } from "../../errors.js";
import type { BlueRefinanceLimit } from "../../limits.js";
import type { SimulationStateChange } from "../../result.js";
import type { ParsedState } from "../state/types.js";
import {
  type CheckContext,
  type CheckedOperation,
  eq,
  fail,
  findMarket,
  findPosition,
  fmtRisk,
  limitViolation,
  riskMetricWad,
  riskOn,
  toMarketEntity,
} from "./helpers.js";

/**
 * Verify a declared `blueRefinance` limit: the source position drains to zero
 * and the target position picks up the moved collateral plus a new debt
 * bounded by the caller's pins. Loan dust is the owner's net loan-token
 * balance change.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: checks read clearest with positional arguments
export function checkRefinanceOperation(
  ctx: CheckContext,
  limit: BlueRefinanceLimit,
  accruedBefore: ParsedState,
  after: ParsedState,
  actionDiff: SimulationStateChange,
): CheckedOperation {
  const account = ctx.owner;
  const sourceMarketId = limit.sourceMarketId;
  const targetMarketId = limit.targetMarketId;

  const sourceBefore = findPosition(
    accruedBefore,
    sourceMarketId,
    account,
    ctx,
    limit,
  );
  const sourceAfter = findPosition(after, sourceMarketId, account, ctx, limit);
  const targetBefore = findPosition(
    accruedBefore,
    targetMarketId,
    account,
    ctx,
    limit,
  );
  const targetAfter = findPosition(after, targetMarketId, account, ctx, limit);

  if (sourceAfter.borrowShares !== 0n || sourceAfter.collateral !== 0n)
    fail(
      ctx,
      limit,
      `Refinance source ${sourceMarketId} retains borrow shares "${sourceAfter.borrowShares}" or collateral "${sourceAfter.collateral}" after a full close`,
    );

  // The moved collateral lands on the target verbatim.
  if (
    targetAfter.collateral !==
    targetBefore.collateral + sourceBefore.collateral
  )
    fail(
      ctx,
      limit,
      `Target collateral "${targetAfter.collateral}", expected "${targetBefore.collateral + sourceBefore.collateral}" (moved "${sourceBefore.collateral}")`,
    );

  const targetMarketAfter = findMarket(after, targetMarketId, ctx, limit);
  const targetInternals = after.internals.markets.get(targetMarketId);
  if (targetInternals == null)
    return fail(
      ctx,
      limit,
      `Refinance target market "${targetMarketId}" internals missing`,
    );
  const targetEntity = toMarketEntity(targetMarketAfter, targetInternals);
  const minted = targetAfter.borrowShares - targetBefore.borrowShares;
  const newDebt = targetEntity.toBorrowAssets(minted, "Up");

  const risk = riskOn(targetAfter, targetEntity);
  if (targetAfter.borrowShares > 0n) {
    if (targetAfter.collateral === 0n)
      throw new MarketConstraintViolationError(
        `Refinance target ${targetMarketId} holds debt with zero collateral`,
        {
          context: {
            stage: "verification",
            chainId: ctx.chainId,
            mode: ctx.mode,
            blockNumber: ctx.block.blockNumber,
            operation: "blueRefinance",
            sourceMarketId,
            targetMarketId,
            failedTransactionIndex: limit.transactionIndex,
          },
        },
      );
    if (risk.ltvWad.type === "finite") {
      const bound = targetInternals.params.lltv - ctx.limits.minLltvBufferWad;
      if (risk.ltvWad.valueWad > bound)
        throw new MarketConstraintViolationError(
          `Refinance target LTV "${risk.ltvWad.valueWad}" exceeds LLTV "${targetInternals.params.lltv}" minus buffer "${ctx.limits.minLltvBufferWad}"`,
          {
            context: {
              stage: "verification",
              chainId: ctx.chainId,
              mode: ctx.mode,
              blockNumber: ctx.block.blockNumber,
              operation: "blueRefinance",
              sourceMarketId,
              targetMarketId,
              failedTransactionIndex: limit.transactionIndex,
            },
          },
        );
    }
  }

  const loanToken = targetInternals.params.loanToken;
  const netLoan = actionDiff.balances
    .filter((c) => eq(c.account, account) && eq(c.token, loanToken))
    .reduce((total, c) => total + c.assets, 0n);
  const loanDust = netLoan < 0n ? -netLoan : netLoan;
  const dustBound = (newDebt * ctx.limits.maxSlippageWad) / 10n ** 18n;
  if (loanDust > dustBound && limit.maxLoanDustAssets === undefined)
    limitViolation(
      ctx,
      limit,
      "maxLoanDustAssets",
      `${dustBound}`,
      `${loanDust}`,
      "Increase the bound or reduce the operation.",
    );

  if (
    limit.maxTargetBorrowAssets !== undefined &&
    newDebt > limit.maxTargetBorrowAssets
  )
    limitViolation(
      ctx,
      limit,
      "maxTargetBorrowAssets",
      `${limit.maxTargetBorrowAssets}`,
      `${newDebt}`,
      "Increase the bound or reduce the operation.",
    );
  if (
    limit.maxTargetBorrowSharesMinted !== undefined &&
    minted > limit.maxTargetBorrowSharesMinted
  )
    limitViolation(
      ctx,
      limit,
      "maxTargetBorrowSharesMinted",
      `${limit.maxTargetBorrowSharesMinted}`,
      `${minted}`,
      "Increase the bound or reduce the operation.",
    );
  if (
    limit.maxSourceResidualBorrowShares !== undefined &&
    sourceAfter.borrowShares > limit.maxSourceResidualBorrowShares
  )
    limitViolation(
      ctx,
      limit,
      "maxSourceResidualBorrowShares",
      `${limit.maxSourceResidualBorrowShares}`,
      `${sourceAfter.borrowShares}`,
      "Increase the bound or reduce the operation.",
    );
  const ltv = riskMetricWad(risk.ltvWad);
  if (
    limit.maxTargetLtvAfterWad !== undefined &&
    (ltv === null || ltv > limit.maxTargetLtvAfterWad)
  )
    limitViolation(
      ctx,
      limit,
      "maxTargetLtvAfterWad",
      `${limit.maxTargetLtvAfterWad}`,
      fmtRisk(risk.ltvWad),
      "Increase the bound or reduce the operation.",
    );
  const health = riskMetricWad(risk.healthFactorWad);
  if (
    limit.minTargetHealthFactorAfterWad !== undefined &&
    health !== null &&
    health < limit.minTargetHealthFactorAfterWad
  )
    limitViolation(
      ctx,
      limit,
      "minTargetHealthFactorAfterWad",
      `${limit.minTargetHealthFactorAfterWad}`,
      fmtRisk(risk.healthFactorWad),
      "Decrease the bound or adjust the operation.",
    );
  if (
    limit.maxLoanDustAssets !== undefined &&
    loanDust > limit.maxLoanDustAssets
  )
    limitViolation(
      ctx,
      limit,
      "maxLoanDustAssets",
      `${limit.maxLoanDustAssets}`,
      `${loanDust}`,
      "Increase the bound or reduce the operation.",
    );

  return {
    operation: limit,
    outcome: {
      targetBorrowAssets: newDebt,
      targetBorrowSharesMinted: minted,
      sourceResidualBorrowShares: sourceAfter.borrowShares,
      targetLtvAfterWad: risk.ltvWad,
      targetHealthFactorAfterWad: risk.healthFactorWad,
      loanDustAssets: loanDust,
    },
  };
}
