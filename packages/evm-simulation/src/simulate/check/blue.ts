import {
  MissingVerificationEvidenceError,
  StateChangeMismatchError,
} from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import type { SimulationStateChange } from "../../result.js";
import type { ParsedState } from "../state/types.js";
import {
  borrowApyAfter,
  type CheckContext,
  type CheckedOperation,
  checkLtv,
  eq,
  fail,
  findMarket,
  findPosition,
  fmtRisk,
  limitViolation,
  opContext,
  receiverCredit,
  riskMetricWad,
  riskOn,
  toMarketEntity,
  utilizationAfter,
} from "./helpers.js";

type BlueOp = Extract<
  OperationLimit,
  {
    readonly type:
      | "blueSupply"
      | "blueWithdraw"
      | "blueSupplyCollateral"
      | "blueBorrow"
      | "blueSupplyCollateralBorrow"
      | "blueRepay"
      | "blueWithdrawCollateral"
      | "blueRepayWithdrawCollateral"
      | "blueAuthorization";
  }
>;

interface BlueObserved {
  readonly positionBefore: ReturnType<typeof findPosition>;
  readonly positionAfter: ReturnType<typeof findPosition>;
  readonly marketBefore: ReturnType<typeof findMarket>;
  readonly marketAfter: ReturnType<typeof findMarket>;
}

/**
 * Verify one declared Blue operation limit against the observed position and
 * market deltas between `accruedBefore` and `after`. Only the fields the
 * caller pins are compared; the observed outcome is always reported.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: checks read clearest with positional arguments
export function checkBlueOperation(
  ctx: CheckContext,
  limit: BlueOp,
  accruedBefore: ParsedState,
  after: ParsedState,
  actionDiff: SimulationStateChange,
): CheckedOperation {
  if (limit.type === "blueAuthorization") {
    const observed = after.morphoAuthorizations.find(
      (a) => eq(a.authorizer, ctx.owner) && eq(a.authorized, limit.authorized),
    )?.after;
    if (observed === undefined)
      fail(
        ctx,
        limit,
        `isAuthorized(${ctx.owner}, ${limit.authorized}) missing from read state`,
      );
    if (
      limit.expectedIsAuthorized !== undefined &&
      observed !== limit.expectedIsAuthorized
    )
      limitViolation(
        ctx,
        limit,
        "expectedIsAuthorized",
        `${limit.expectedIsAuthorized}`,
        `${observed}`,
        "The bundle does not match the declared constraint.",
      );
    return { operation: limit, outcome: { isAuthorized: observed! } };
  }

  const marketId = limit.marketId;
  const internalsBefore = accruedBefore.internals.markets.get(marketId);
  const internalsAfter = after.internals.markets.get(marketId);
  if (internalsBefore == null || internalsAfter == null)
    throw new MissingVerificationEvidenceError(
      `Market "${marketId}" internals missing`,
      { context: opContext(ctx, limit) },
    );

  // The acting account: caller-pinned `expectedOnBehalf` or the sender.
  const account =
    "expectedOnBehalf" in limit && limit.expectedOnBehalf !== undefined
      ? limit.expectedOnBehalf
      : ctx.owner;
  const observed: BlueObserved = {
    positionBefore: findPosition(accruedBefore, marketId, account, ctx, limit),
    positionAfter: findPosition(after, marketId, account, ctx, limit),
    marketBefore: findMarket(accruedBefore, marketId, ctx, limit),
    marketAfter: findMarket(after, marketId, ctx, limit),
  };
  const marketEntity = toMarketEntity(observed.marketBefore, internalsBefore);
  const marketAfterEntity = toMarketEntity(
    observed.marketAfter,
    internalsAfter,
  );
  const risk = riskOn(observed.positionAfter, marketAfterEntity);
  const utilization = utilizationAfter(marketAfterEntity);
  const ltv = riskMetricWad(risk.ltvWad);
  const health = riskMetricWad(risk.healthFactorWad);
  const util = riskMetricWad(utilization);

  const pinLtv = (bound: bigint | undefined) => {
    if (bound !== undefined && (ltv === null || ltv > bound))
      limitViolation(
        ctx,
        limit,
        "maxLtvAfterWad",
        `${bound}`,
        fmtRisk(risk.ltvWad),
        "Increase the bound or reduce the operation.",
      );
  };
  const pinHealth = (bound: bigint | undefined) => {
    if (bound !== undefined && health !== null && health < bound)
      limitViolation(
        ctx,
        limit,
        "minHealthFactorAfterWad",
        `${bound}`,
        fmtRisk(risk.healthFactorWad),
        "Decrease the bound or adjust the operation.",
      );
  };
  const pinUtilization = (bound: bigint | undefined) => {
    if (bound !== undefined && (util === null || util > bound))
      limitViolation(
        ctx,
        limit,
        "maxUtilizationAfterWad",
        `${bound}`,
        fmtRisk(utilization),
        "Increase the bound or reduce the operation.",
      );
  };

  switch (limit.type) {
    case "blueSupply": {
      const sharesMinted =
        observed.positionAfter.supplyShares -
        observed.positionBefore.supplyShares;
      const assetsSupplied =
        observed.positionAfter.supplyAssets -
        observed.positionBefore.supplyAssets;
      if (limit.expectedAssets !== undefined) {
        const expectedShares = marketEntity.toSupplyShares(
          limit.expectedAssets,
          "Down",
        );
        if (
          sharesMinted !== expectedShares &&
          assetsSupplied !== limit.expectedAssets
        )
          limitViolation(
            ctx,
            limit,
            "expectedAssets",
            `${limit.expectedAssets}`,
            `${assetsSupplied}`,
            "The bundle does not match the declared constraint.",
          );
      }
      if (
        limit.minSupplySharesMinted !== undefined &&
        sharesMinted < limit.minSupplySharesMinted
      )
        limitViolation(
          ctx,
          limit,
          "minSupplySharesMinted",
          `${limit.minSupplySharesMinted}`,
          `${sharesMinted}`,
          "Decrease the bound or adjust the operation.",
        );
      return {
        operation: limit,
        outcome: { supplySharesMinted: sharesMinted },
      };
    }

    case "blueWithdraw": {
      const sharesBurned =
        observed.positionBefore.supplyShares -
        observed.positionAfter.supplyShares;
      const residual = observed.positionAfter.supplyShares;
      if (
        limit.expectedFullClose !== undefined &&
        limit.expectedFullClose !== (residual === 0n)
      )
        limitViolation(
          ctx,
          limit,
          "expectedFullClose",
          `${limit.expectedFullClose}`,
          `${residual === 0n}`,
          "The bundle does not match the declared constraint.",
        );
      const credit = receiverCredit(
        actionDiff,
        limit.expectedReceiver ?? ctx.owner,
        internalsBefore.params.loanToken,
      );
      if (
        limit.minAssetsReceived !== undefined &&
        credit < limit.minAssetsReceived
      )
        limitViolation(
          ctx,
          limit,
          "minAssetsReceived",
          `${limit.minAssetsReceived}`,
          `${credit}`,
          "Decrease the bound or adjust the operation.",
        );
      if (
        limit.maxSupplySharesBurned !== undefined &&
        sharesBurned > limit.maxSupplySharesBurned
      )
        limitViolation(
          ctx,
          limit,
          "maxSupplySharesBurned",
          `${limit.maxSupplySharesBurned}`,
          `${sharesBurned}`,
          "Increase the bound or reduce the operation.",
        );
      pinUtilization(limit.maxUtilizationAfterWad);
      return {
        operation: limit,
        outcome: {
          assetsReceived: credit,
          supplySharesBurned: sharesBurned,
          utilizationAfterWad: utilization,
        },
      };
    }

    case "blueSupplyCollateral": {
      const collateralAdded =
        observed.positionAfter.collateral - observed.positionBefore.collateral;
      if (
        limit.expectedAssets !== undefined &&
        collateralAdded !== limit.expectedAssets
      )
        limitViolation(
          ctx,
          limit,
          "expectedAssets",
          `${limit.expectedAssets}`,
          `${collateralAdded}`,
          "The bundle does not match the declared constraint.",
        );
      pinLtv(limit.maxLtvAfterWad);
      return { operation: limit, outcome: { ltvAfterWad: risk.ltvWad } };
    }

    case "blueBorrow": {
      const borrowSharesMinted =
        observed.positionAfter.borrowShares -
        observed.positionBefore.borrowShares;
      const credit = receiverCredit(
        actionDiff,
        limit.expectedReceiver ?? ctx.owner,
        internalsBefore.params.loanToken,
      );
      if (limit.expectedAssets !== undefined && credit !== limit.expectedAssets)
        limitViolation(
          ctx,
          limit,
          "expectedAssets",
          `${limit.expectedAssets}`,
          `${credit}`,
          "The bundle does not match the declared constraint.",
        );
      if (
        limit.maxBorrowSharesMinted !== undefined &&
        borrowSharesMinted > limit.maxBorrowSharesMinted
      )
        limitViolation(
          ctx,
          limit,
          "maxBorrowSharesMinted",
          `${limit.maxBorrowSharesMinted}`,
          `${borrowSharesMinted}`,
          "Increase the bound or reduce the operation.",
        );
      checkLtv(
        ctx,
        limit,
        observed.positionAfter,
        marketAfterEntity,
        internalsAfter.params.lltv,
      );
      pinLtv(limit.maxLtvAfterWad);
      pinHealth(limit.minHealthFactorAfterWad);
      pinUtilization(limit.maxUtilizationAfterWad);
      const borrowApy = borrowApyAfter(marketAfterEntity);
      if (
        limit.maxAfterBorrowApyWad !== undefined &&
        borrowApy > limit.maxAfterBorrowApyWad
      )
        limitViolation(
          ctx,
          limit,
          "maxAfterBorrowApyWad",
          `${limit.maxAfterBorrowApyWad}`,
          `${borrowApy}`,
          "Increase the bound or reduce the operation.",
        );
      return {
        operation: limit,
        outcome: {
          borrowSharesMinted,
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
          utilizationAfterWad: utilization,
          borrowApyAfterWad: borrowApy,
        },
      };
    }

    case "blueSupplyCollateralBorrow": {
      const collateralAdded =
        observed.positionAfter.collateral - observed.positionBefore.collateral;
      const borrowSharesMinted =
        observed.positionAfter.borrowShares -
        observed.positionBefore.borrowShares;
      if (
        limit.expectedCollateralAssets !== undefined &&
        collateralAdded !== limit.expectedCollateralAssets
      )
        limitViolation(
          ctx,
          limit,
          "expectedCollateralAssets",
          `${limit.expectedCollateralAssets}`,
          `${collateralAdded}`,
          "The bundle does not match the declared constraint.",
        );
      const credit = receiverCredit(
        actionDiff,
        limit.expectedReceiver ?? ctx.owner,
        internalsBefore.params.loanToken,
      );
      if (
        limit.expectedBorrowAssets !== undefined &&
        credit !== limit.expectedBorrowAssets
      )
        limitViolation(
          ctx,
          limit,
          "expectedBorrowAssets",
          `${limit.expectedBorrowAssets}`,
          `${credit}`,
          "The bundle does not match the declared constraint.",
        );
      if (
        limit.maxBorrowSharesMinted !== undefined &&
        borrowSharesMinted > limit.maxBorrowSharesMinted
      )
        limitViolation(
          ctx,
          limit,
          "maxBorrowSharesMinted",
          `${limit.maxBorrowSharesMinted}`,
          `${borrowSharesMinted}`,
          "Increase the bound or reduce the operation.",
        );
      checkLtv(
        ctx,
        limit,
        observed.positionAfter,
        marketAfterEntity,
        internalsAfter.params.lltv,
      );
      pinLtv(limit.maxLtvAfterWad);
      pinHealth(limit.minHealthFactorAfterWad);
      pinUtilization(limit.maxUtilizationAfterWad);
      const borrowApy = borrowApyAfter(marketAfterEntity);
      if (
        limit.maxAfterBorrowApyWad !== undefined &&
        borrowApy > limit.maxAfterBorrowApyWad
      )
        limitViolation(
          ctx,
          limit,
          "maxAfterBorrowApyWad",
          `${limit.maxAfterBorrowApyWad}`,
          `${borrowApy}`,
          "Increase the bound or reduce the operation.",
        );
      return {
        operation: limit,
        outcome: {
          borrowSharesMinted,
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
          utilizationAfterWad: utilization,
          borrowApyAfterWad: borrowApy,
        },
      };
    }

    case "blueRepay":
    case "blueRepayWithdrawCollateral": {
      const borrowSharesBurned =
        observed.positionBefore.borrowShares -
        observed.positionAfter.borrowShares;
      const residual = observed.positionAfter.borrowShares;
      // Assets paid = loan-token debit of the owner; a capped repay refunds
      // the excess to `onBehalf`, visible as a loan-token credit.
      const assetsPaid = -receiverCredit(
        actionDiff,
        ctx.owner,
        internalsBefore.params.loanToken,
      );
      const refundAssets =
        actionDiff.balances
          .filter(
            (c) =>
              eq(c.account, account) &&
              eq(c.token, internalsBefore.params.loanToken),
          )
          .reduce((t, c) => t + c.assets, 0n) || 0n;
      if (
        limit.expectedFullClose !== undefined &&
        limit.expectedFullClose !== (residual === 0n)
      )
        limitViolation(
          ctx,
          limit,
          "expectedFullClose",
          `${limit.expectedFullClose}`,
          `${residual === 0n}`,
          "The bundle does not match the declared constraint.",
        );
      if (limit.maxAssetsPaid !== undefined && assetsPaid > limit.maxAssetsPaid)
        limitViolation(
          ctx,
          limit,
          "maxAssetsPaid",
          `${limit.maxAssetsPaid}`,
          `${assetsPaid}`,
          "Increase the bound or reduce the operation.",
        );
      if (
        limit.minBorrowSharesBurned !== undefined &&
        borrowSharesBurned < limit.minBorrowSharesBurned
      )
        limitViolation(
          ctx,
          limit,
          "minBorrowSharesBurned",
          `${limit.minBorrowSharesBurned}`,
          `${borrowSharesBurned}`,
          "Decrease the bound or adjust the operation.",
        );
      if (
        limit.maxResidualBorrowShares !== undefined &&
        residual > limit.maxResidualBorrowShares
      )
        limitViolation(
          ctx,
          limit,
          "maxResidualBorrowShares",
          `${limit.maxResidualBorrowShares}`,
          `${residual}`,
          "Increase the bound or reduce the operation.",
        );
      if (
        limit.minRefundAssets !== undefined &&
        refundAssets < limit.minRefundAssets
      )
        limitViolation(
          ctx,
          limit,
          "minRefundAssets",
          `${limit.minRefundAssets}`,
          `${refundAssets}`,
          "Decrease the bound or adjust the operation.",
        );

      let outcome: CheckedOperation["outcome"] = {
        assetsPaid,
        borrowSharesBurned,
        residualBorrowShares: residual,
        refundAssets,
        ltvAfterWad: risk.ltvWad,
        healthFactorAfterWad: risk.healthFactorWad,
      };
      if (limit.type === "blueRepayWithdrawCollateral") {
        const collateralWithdrawn =
          observed.positionBefore.collateral -
          observed.positionAfter.collateral;
        if (
          limit.expectedWithdrawAssets !== undefined &&
          collateralWithdrawn !== limit.expectedWithdrawAssets
        )
          limitViolation(
            ctx,
            limit,
            "expectedWithdrawAssets",
            `${limit.expectedWithdrawAssets}`,
            `${collateralWithdrawn}`,
            "The bundle does not match the declared constraint.",
          );
        if (residual !== 0n)
          checkLtv(
            ctx,
            limit,
            observed.positionAfter,
            marketAfterEntity,
            internalsAfter.params.lltv,
          );
        pinLtv(limit.maxLtvAfterWad);
        pinHealth(limit.minHealthFactorAfterWad);
        outcome = { ...outcome, collateralWithdrawn };
      }
      return { operation: limit, outcome };
    }

    case "blueWithdrawCollateral": {
      const collateralWithdrawn =
        observed.positionBefore.collateral - observed.positionAfter.collateral;
      if (
        limit.expectedAssets !== undefined &&
        collateralWithdrawn !== limit.expectedAssets
      )
        limitViolation(
          ctx,
          limit,
          "expectedAssets",
          `${limit.expectedAssets}`,
          `${collateralWithdrawn}`,
          "The bundle does not match the declared constraint.",
        );
      const credit = receiverCredit(
        actionDiff,
        limit.expectedReceiver ?? ctx.owner,
        internalsBefore.params.collateralToken,
      );
      checkLtv(
        ctx,
        limit,
        observed.positionAfter,
        marketAfterEntity,
        internalsAfter.params.lltv,
      );
      pinLtv(limit.maxLtvAfterWad);
      pinHealth(limit.minHealthFactorAfterWad);
      return {
        operation: limit,
        outcome: {
          collateralWithdrawn,
          assetsReceived: credit,
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
        },
      };
    }

    default: {
      const _exhaustive: never = limit;
      throw new StateChangeMismatchError(
        `checkBlueOperation received ${JSON.stringify(_exhaustive)}`,
        { context: opContext(ctx, limit as BlueOp) },
      );
    }
  }
}
