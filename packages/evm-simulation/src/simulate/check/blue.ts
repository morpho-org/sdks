import type { DecodedOperation } from "../../decode/operation.js";
import {
  MissingVerificationEvidenceError,
  StateChangeMismatchError,
  UnexpectedSimulationError,
} from "../../errors.js";
import type { SimulationStateChange } from "../../result.js";
import type { ParsedState, RiskMetric } from "../state/types.js";
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
  limitsFor,
  limitViolation,
  opContext,
  reallocationPenalty,
  riskMetricWad,
  riskOn,
  toMarketEntity,
  utilizationAfter,
} from "./helpers.js";
import { checkRefinanceOperation } from "./refinance.js";

/**
 * Verify one Blue-bundle operation's effects on the owner's position and the
 * market, against `accruedBefore → after`. All share/asset math delegates to
 * blue-sdk {@link AccrualPosition} and `Market` converters.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: checks read clearest with positional arguments
export function checkBlueOperation(
  ctx: CheckContext,
  operation: Extract<
    DecodedOperation,
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
        | "blueRefinance"
        | "blueAuthorization";
    }
  >,
  accruedBefore: ParsedState,
  after: ParsedState,
  actionDiff: SimulationStateChange,
): CheckedOperation {
  if (operation.type === "blueAuthorization") {
    for (const limit of limitsFor(ctx, "blueAuthorization", operation)) {
      if (!eq(limit.authorized, operation.authorized))
        limitViolation(
          ctx,
          operation,
          "authorized",
          limit.authorized,
          operation.authorized,
          "The bundle does not match the declared constraint.",
        );
      if (
        limit.expectedIsAuthorized !== undefined &&
        limit.expectedIsAuthorized !== operation.isAuthorized
      )
        limitViolation(
          ctx,
          operation,
          "expectedIsAuthorized",
          `${limit.expectedIsAuthorized}`,
          `${operation.isAuthorized}`,
          "The bundle does not match the declared constraint.",
        );
    }
    return {
      operation,
      outcome: { isAuthorized: operation.isAuthorized },
    };
  }

  if (operation.type === "blueRefinance") {
    return checkRefinanceOperation(
      ctx,
      operation,
      accruedBefore,
      after,
      actionDiff,
    );
  }

  const marketId = operation.market.marketId;
  const internalsBefore = accruedBefore.internals.markets.get(marketId);
  const marketBefore = findMarket(accruedBefore, marketId, ctx, operation);
  const marketAfter = findMarket(after, marketId, ctx, operation);
  const internalsAfter = after.internals.markets.get(marketId);
  if (internalsBefore == null || internalsAfter == null)
    throw new MissingVerificationEvidenceError(
      `Market "${marketId}" internals missing`,
      { context: opContext(ctx, operation) },
    );
  const before = findPosition(
    accruedBefore,
    marketId,
    operation.onBehalf,
    ctx,
    operation,
  );
  const next = findPosition(
    after,
    marketId,
    operation.onBehalf,
    ctx,
    operation,
  );
  const market = toMarketEntity(marketBefore, internalsBefore);
  const marketAfterEntity = toMarketEntity(marketAfter, internalsAfter);

  const oraclePresent = marketBefore.oraclePrice != null;
  const irmPresent = internalsBefore.rateAtTargetPerSecondWad != null;

  switch (operation.type) {
    case "blueSupply": {
      const shares = market.toSupplyShares(operation.assets, "Down");
      const expectedShares = before.supplyShares + shares;
      if (next.supplyShares !== expectedShares)
        fail(
          ctx,
          operation,
          `Supply shares "${next.supplyShares}", expected "${expectedShares}" (before "${before.supplyShares}" + "${shares}")`,
        );
      const minAssets = operation.assets === 0n ? 0n : operation.assets - 1n;
      if (next.supplyAssets - before.supplyAssets < minAssets)
        fail(
          ctx,
          operation,
          `Supply assets grew by "${next.supplyAssets - before.supplyAssets}", below "${minAssets}"`,
        );
      if (next.borrowShares !== before.borrowShares)
        fail(ctx, operation, "Supply must not change borrow shares");
      if (next.collateral !== before.collateral)
        fail(ctx, operation, "Supply must not change collateral");
      const supplyDelta =
        marketAfter.totalSupplyAssets - marketBefore.totalSupplyAssets;
      if (supplyDelta !== operation.assets)
        fail(
          ctx,
          operation,
          `Market supply grew by "${supplyDelta}", expected "${operation.assets}"`,
        );
      for (const limit of limitsFor(ctx, "blueSupply", operation)) {
        if (
          limit.marketId.toLowerCase() !==
          operation.market.marketId.toLowerCase()
        )
          limitViolation(
            ctx,
            operation,
            "marketId",
            limit.marketId,
            operation.market.marketId,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedAssets !== undefined &&
          limit.expectedAssets !== operation.assets
        )
          limitViolation(
            ctx,
            operation,
            "expectedAssets",
            `${limit.expectedAssets}`,
            `${operation.assets}`,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedOnBehalf !== undefined &&
          !eq(limit.expectedOnBehalf, operation.onBehalf)
        )
          limitViolation(
            ctx,
            operation,
            "expectedOnBehalf",
            limit.expectedOnBehalf,
            operation.onBehalf,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.minSupplySharesMinted !== undefined &&
          shares < limit.minSupplySharesMinted
        )
          limitViolation(
            ctx,
            operation,
            "minSupplySharesMinted",
            `${limit.minSupplySharesMinted}`,
            `${shares}`,
            "Decrease the bound or adjust the operation.",
          );
      }
      return {
        operation,
        outcome: { supplySharesMinted: shares },
      };
    }

    case "blueWithdraw": {
      let sharesBurned: bigint;
      let assetsOut: bigint;
      if (operation.amount.type === "assets") {
        assetsOut = operation.amount.assets;
        sharesBurned = market.toSupplyShares(assetsOut, "Up");
      } else {
        sharesBurned = operation.amount.shares;
        assetsOut = market.toSupplyAssets(sharesBurned, "Down");
      }
      if (next.supplyShares !== before.supplyShares - sharesBurned)
        fail(
          ctx,
          operation,
          `Supply shares "${next.supplyShares}", expected "${before.supplyShares - sharesBurned}"`,
        );
      const liquidityDelta =
        marketAfter.liquidityAssets - marketBefore.liquidityAssets;
      if (liquidityDelta !== -assetsOut)
        fail(
          ctx,
          operation,
          `Market liquidity moved "${liquidityDelta}", expected "${-assetsOut}"`,
        );
      if (operation.fullClose && next.supplyShares !== 0n)
        fail(
          ctx,
          operation,
          `Full withdraw left "${next.supplyShares}" supply shares`,
        );
      const utilization = utilizationAfter(marketAfterEntity);
      const penalty = reallocationPenalty(operation.reallocations ?? []);
      for (const limit of limitsFor(ctx, "blueWithdraw", operation)) {
        if (
          limit.marketId.toLowerCase() !==
          operation.market.marketId.toLowerCase()
        )
          limitViolation(
            ctx,
            operation,
            "marketId",
            limit.marketId,
            operation.market.marketId,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedReceiver !== undefined &&
          !eq(limit.expectedReceiver, operation.receiver)
        )
          limitViolation(
            ctx,
            operation,
            "expectedReceiver",
            limit.expectedReceiver,
            operation.receiver,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedFullClose !== undefined &&
          limit.expectedFullClose !== operation.fullClose
        )
          limitViolation(
            ctx,
            operation,
            "expectedFullClose",
            `${limit.expectedFullClose}`,
            `${operation.fullClose}`,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.minAssetsReceived !== undefined &&
          assetsOut < limit.minAssetsReceived
        )
          limitViolation(
            ctx,
            operation,
            "minAssetsReceived",
            `${limit.minAssetsReceived}`,
            `${assetsOut}`,
            "Decrease the bound or adjust the operation.",
          );
        if (
          limit.maxSupplySharesBurned !== undefined &&
          sharesBurned > limit.maxSupplySharesBurned
        )
          limitViolation(
            ctx,
            operation,
            "maxSupplySharesBurned",
            `${limit.maxSupplySharesBurned}`,
            `${sharesBurned}`,
            "Increase the bound or reduce the operation.",
          );
        {
          const util = riskMetricWad(utilization);
          if (
            limit.maxUtilizationAfterWad !== undefined &&
            (util === null || util > limit.maxUtilizationAfterWad)
          )
            limitViolation(
              ctx,
              operation,
              "maxUtilizationAfterWad",
              `${limit.maxUtilizationAfterWad}`,
              fmtRisk(utilization),
              "Increase the bound or reduce the operation.",
            );
        }
        if (
          limit.maxReallocationPenaltyAssets !== undefined &&
          penalty > limit.maxReallocationPenaltyAssets
        )
          limitViolation(
            ctx,
            operation,
            "maxReallocationPenaltyAssets",
            `${limit.maxReallocationPenaltyAssets}`,
            `${penalty}`,
            "Increase the bound or reduce the operation.",
          );
      }
      return {
        operation,
        outcome: {
          assetsReceived: assetsOut,
          supplySharesBurned: sharesBurned,
          utilizationAfterWad: utilization,
          reallocationPenaltyAssets: penalty,
        },
      };
    }

    case "blueSupplyCollateral": {
      if (next.collateral !== before.collateral + operation.collateralAssets)
        fail(
          ctx,
          operation,
          `Collateral "${next.collateral}", expected "${before.collateral + operation.collateralAssets}"`,
        );
      if (next.supplyShares !== before.supplyShares)
        fail(ctx, operation, "SupplyCollateral must not change supply");
      if (next.borrowShares !== before.borrowShares)
        fail(ctx, operation, "SupplyCollateral must not change borrow");
      const ltvAfter = riskOn(next, marketAfterEntity).ltvWad;
      for (const limit of limitsFor(ctx, "blueSupplyCollateral", operation)) {
        if (
          limit.marketId.toLowerCase() !==
          operation.market.marketId.toLowerCase()
        )
          limitViolation(
            ctx,
            operation,
            "marketId",
            limit.marketId,
            operation.market.marketId,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedAssets !== undefined &&
          limit.expectedAssets !== operation.collateralAssets
        )
          limitViolation(
            ctx,
            operation,
            "expectedAssets",
            `${limit.expectedAssets}`,
            `${operation.collateralAssets}`,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedOnBehalf !== undefined &&
          !eq(limit.expectedOnBehalf, operation.onBehalf)
        )
          limitViolation(
            ctx,
            operation,
            "expectedOnBehalf",
            limit.expectedOnBehalf,
            operation.onBehalf,
            "The bundle does not match the declared constraint.",
          );
        const ltv = riskMetricWad(ltvAfter);
        if (
          limit.maxLtvAfterWad !== undefined &&
          (ltv === null || ltv > limit.maxLtvAfterWad)
        )
          limitViolation(
            ctx,
            operation,
            "maxLtvAfterWad",
            `${limit.maxLtvAfterWad}`,
            fmtRisk(ltvAfter),
            "Increase the bound or reduce the operation.",
          );
      }
      return {
        operation,
        outcome: { ltvAfterWad: ltvAfter },
      };
    }

    case "blueWithdrawCollateral": {
      if (next.collateral !== before.collateral - operation.collateralAssets)
        fail(
          ctx,
          operation,
          `Collateral "${next.collateral}", expected "${before.collateral - operation.collateralAssets}"`,
        );
      const risk = checkLtv(
        ctx,
        operation,
        next,
        marketAfterEntity,
        internalsAfter.params.lltv,
      );
      for (const limit of limitsFor(ctx, "blueWithdrawCollateral", operation)) {
        if (
          limit.marketId.toLowerCase() !==
          operation.market.marketId.toLowerCase()
        )
          limitViolation(
            ctx,
            operation,
            "marketId",
            limit.marketId,
            operation.market.marketId,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedAssets !== undefined &&
          limit.expectedAssets !== operation.collateralAssets
        )
          limitViolation(
            ctx,
            operation,
            "expectedAssets",
            `${limit.expectedAssets}`,
            `${operation.collateralAssets}`,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedReceiver !== undefined &&
          !eq(limit.expectedReceiver, operation.receiver)
        )
          limitViolation(
            ctx,
            operation,
            "expectedReceiver",
            limit.expectedReceiver,
            operation.receiver,
            "The bundle does not match the declared constraint.",
          );
        const ltv = riskMetricWad(risk.ltvWad);
        if (
          limit.maxLtvAfterWad !== undefined &&
          (ltv === null || ltv > limit.maxLtvAfterWad)
        )
          limitViolation(
            ctx,
            operation,
            "maxLtvAfterWad",
            `${limit.maxLtvAfterWad}`,
            fmtRisk(risk.ltvWad),
            "Increase the bound or reduce the operation.",
          );
        const health = riskMetricWad(risk.healthFactorWad);
        if (
          limit.minHealthFactorAfterWad !== undefined &&
          health !== null &&
          health < limit.minHealthFactorAfterWad
        )
          limitViolation(
            ctx,
            operation,
            "minHealthFactorAfterWad",
            `${limit.minHealthFactorAfterWad}`,
            fmtRisk(risk.healthFactorWad),
            "Decrease the bound or adjust the operation.",
          );
      }
      return {
        operation,
        outcome: {
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
        },
      };
    }

    case "blueBorrow": {
      if (!oraclePresent || !irmPresent)
        throw new MissingVerificationEvidenceError(
          `Borrow on market "${marketId}" requires oracle and IRM reads; one is missing`,
          { context: opContext(ctx, operation) },
        );
      const shares = market.toBorrowShares(operation.borrowAssets, "Up");
      if (next.borrowShares !== before.borrowShares + shares)
        fail(
          ctx,
          operation,
          `Borrow shares "${next.borrowShares}", expected "${before.borrowShares + shares}"`,
        );
      const liquidityDelta =
        marketAfter.liquidityAssets - marketBefore.liquidityAssets;
      if (liquidityDelta !== -operation.borrowAssets)
        fail(
          ctx,
          operation,
          `Market liquidity moved "${liquidityDelta}", expected "${-operation.borrowAssets}"`,
        );
      const risk = checkLtv(
        ctx,
        operation,
        next,
        marketAfterEntity,
        internalsAfter.params.lltv,
      );
      const utilization = utilizationAfter(marketAfterEntity);
      const borrowApy = borrowApyAfter(marketAfterEntity);
      const penalty = reallocationPenalty(operation.reallocations ?? []);
      for (const limit of limitsFor(ctx, "blueBorrow", operation)) {
        if (
          limit.marketId.toLowerCase() !==
          operation.market.marketId.toLowerCase()
        )
          limitViolation(
            ctx,
            operation,
            "marketId",
            limit.marketId,
            operation.market.marketId,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedAssets !== undefined &&
          limit.expectedAssets !== operation.borrowAssets
        )
          limitViolation(
            ctx,
            operation,
            "expectedAssets",
            `${limit.expectedAssets}`,
            `${operation.borrowAssets}`,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedReceiver !== undefined &&
          !eq(limit.expectedReceiver, operation.receiver)
        )
          limitViolation(
            ctx,
            operation,
            "expectedReceiver",
            limit.expectedReceiver,
            operation.receiver,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.maxBorrowSharesMinted !== undefined &&
          shares > limit.maxBorrowSharesMinted
        )
          limitViolation(
            ctx,
            operation,
            "maxBorrowSharesMinted",
            `${limit.maxBorrowSharesMinted}`,
            `${shares}`,
            "Increase the bound or reduce the operation.",
          );
        const ltv = riskMetricWad(risk.ltvWad);
        if (
          limit.maxLtvAfterWad !== undefined &&
          (ltv === null || ltv > limit.maxLtvAfterWad)
        )
          limitViolation(
            ctx,
            operation,
            "maxLtvAfterWad",
            `${limit.maxLtvAfterWad}`,
            fmtRisk(risk.ltvWad),
            "Increase the bound or reduce the operation.",
          );
        const health = riskMetricWad(risk.healthFactorWad);
        if (
          limit.minHealthFactorAfterWad !== undefined &&
          health !== null &&
          health < limit.minHealthFactorAfterWad
        )
          limitViolation(
            ctx,
            operation,
            "minHealthFactorAfterWad",
            `${limit.minHealthFactorAfterWad}`,
            fmtRisk(risk.healthFactorWad),
            "Decrease the bound or adjust the operation.",
          );
        const util = riskMetricWad(utilization);
        if (
          limit.maxUtilizationAfterWad !== undefined &&
          (util === null || util > limit.maxUtilizationAfterWad)
        )
          limitViolation(
            ctx,
            operation,
            "maxUtilizationAfterWad",
            `${limit.maxUtilizationAfterWad}`,
            fmtRisk(utilization),
            "Increase the bound or reduce the operation.",
          );
        if (
          limit.maxAfterBorrowApyWad !== undefined &&
          borrowApy > limit.maxAfterBorrowApyWad
        )
          limitViolation(
            ctx,
            operation,
            "maxAfterBorrowApyWad",
            `${limit.maxAfterBorrowApyWad}`,
            `${borrowApy}`,
            "Increase the bound or reduce the operation.",
          );
        if (
          limit.maxReallocationPenaltyAssets !== undefined &&
          penalty > limit.maxReallocationPenaltyAssets
        )
          limitViolation(
            ctx,
            operation,
            "maxReallocationPenaltyAssets",
            `${limit.maxReallocationPenaltyAssets}`,
            `${penalty}`,
            "Increase the bound or reduce the operation.",
          );
      }
      return {
        operation,
        outcome: {
          borrowSharesMinted: shares,
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
          utilizationAfterWad: utilization,
          borrowApyAfterWad: borrowApy,
          reallocationPenaltyAssets: penalty,
        },
      };
    }

    case "blueSupplyCollateralBorrow": {
      if (next.collateral !== before.collateral + operation.collateralAssets)
        fail(
          ctx,
          operation,
          `Collateral "${next.collateral}", expected "${before.collateral + operation.collateralAssets}"`,
        );
      const shares = market.toBorrowShares(operation.borrowAssets, "Up");
      if (next.borrowShares !== before.borrowShares + shares)
        fail(
          ctx,
          operation,
          `Borrow shares "${next.borrowShares}", expected "${before.borrowShares + shares}"`,
        );
      const risk = checkLtv(
        ctx,
        operation,
        next,
        marketAfterEntity,
        internalsAfter.params.lltv,
      );
      const utilization = utilizationAfter(marketAfterEntity);
      const borrowApy = borrowApyAfter(marketAfterEntity);
      const penalty = reallocationPenalty(operation.reallocations ?? []);
      for (const limit of limitsFor(
        ctx,
        "blueSupplyCollateralBorrow",
        operation,
      )) {
        if (
          limit.marketId.toLowerCase() !==
          operation.market.marketId.toLowerCase()
        )
          limitViolation(
            ctx,
            operation,
            "marketId",
            limit.marketId,
            operation.market.marketId,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedCollateralAssets !== undefined &&
          limit.expectedCollateralAssets !== operation.collateralAssets
        )
          limitViolation(
            ctx,
            operation,
            "expectedCollateralAssets",
            `${limit.expectedCollateralAssets}`,
            `${operation.collateralAssets}`,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedBorrowAssets !== undefined &&
          limit.expectedBorrowAssets !== operation.borrowAssets
        )
          limitViolation(
            ctx,
            operation,
            "expectedBorrowAssets",
            `${limit.expectedBorrowAssets}`,
            `${operation.borrowAssets}`,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedOnBehalf !== undefined &&
          !eq(limit.expectedOnBehalf, operation.onBehalf)
        )
          limitViolation(
            ctx,
            operation,
            "expectedOnBehalf",
            limit.expectedOnBehalf,
            operation.onBehalf,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedReceiver !== undefined &&
          !eq(limit.expectedReceiver, operation.receiver)
        )
          limitViolation(
            ctx,
            operation,
            "expectedReceiver",
            limit.expectedReceiver,
            operation.receiver,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.maxBorrowSharesMinted !== undefined &&
          shares > limit.maxBorrowSharesMinted
        )
          limitViolation(
            ctx,
            operation,
            "maxBorrowSharesMinted",
            `${limit.maxBorrowSharesMinted}`,
            `${shares}`,
            "Increase the bound or reduce the operation.",
          );
        const ltv = riskMetricWad(risk.ltvWad);
        if (
          limit.maxLtvAfterWad !== undefined &&
          (ltv === null || ltv > limit.maxLtvAfterWad)
        )
          limitViolation(
            ctx,
            operation,
            "maxLtvAfterWad",
            `${limit.maxLtvAfterWad}`,
            fmtRisk(risk.ltvWad),
            "Increase the bound or reduce the operation.",
          );
        const health = riskMetricWad(risk.healthFactorWad);
        if (
          limit.minHealthFactorAfterWad !== undefined &&
          health !== null &&
          health < limit.minHealthFactorAfterWad
        )
          limitViolation(
            ctx,
            operation,
            "minHealthFactorAfterWad",
            `${limit.minHealthFactorAfterWad}`,
            fmtRisk(risk.healthFactorWad),
            "Decrease the bound or adjust the operation.",
          );
        const util = riskMetricWad(utilization);
        if (
          limit.maxUtilizationAfterWad !== undefined &&
          (util === null || util > limit.maxUtilizationAfterWad)
        )
          limitViolation(
            ctx,
            operation,
            "maxUtilizationAfterWad",
            `${limit.maxUtilizationAfterWad}`,
            fmtRisk(utilization),
            "Increase the bound or reduce the operation.",
          );
        if (
          limit.maxAfterBorrowApyWad !== undefined &&
          borrowApy > limit.maxAfterBorrowApyWad
        )
          limitViolation(
            ctx,
            operation,
            "maxAfterBorrowApyWad",
            `${limit.maxAfterBorrowApyWad}`,
            `${borrowApy}`,
            "Increase the bound or reduce the operation.",
          );
        if (
          limit.maxReallocationPenaltyAssets !== undefined &&
          penalty > limit.maxReallocationPenaltyAssets
        )
          limitViolation(
            ctx,
            operation,
            "maxReallocationPenaltyAssets",
            `${limit.maxReallocationPenaltyAssets}`,
            `${penalty}`,
            "Increase the bound or reduce the operation.",
          );
      }
      return {
        operation,
        outcome: {
          borrowSharesMinted: shares,
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
          utilizationAfterWad: utilization,
          borrowApyAfterWad: borrowApy,
          reallocationPenaltyAssets: penalty,
        },
      };
    }

    case "blueRepay":
    case "blueRepayWithdrawCollateral": {
      let sharesBurned: bigint;
      let assetsPaid: bigint;
      if (operation.repay.type === "assets") {
        assetsPaid = operation.repay.assets;
        sharesBurned = market.toBorrowShares(assetsPaid, "Down");
      } else {
        sharesBurned = operation.repay.shares;
        assetsPaid = market.toBorrowAssets(sharesBurned, "Up");
      }
      const residual = before.borrowShares - sharesBurned;
      if (residual < 0n)
        fail(
          ctx,
          operation,
          `Repay burned "${sharesBurned}" shares, more than the "${before.borrowShares}" owed`,
        );
      if (next.borrowShares !== residual)
        fail(
          ctx,
          operation,
          `Residual borrow shares "${next.borrowShares}", expected "${residual}"`,
        );
      if (operation.fullClose && next.borrowShares !== 0n)
        throw new StateChangeMismatchError(
          `Full repay left "${next.borrowShares}" borrow shares`,
          { context: opContext(ctx, operation) },
        );
      if (operation.type === "blueRepayWithdrawCollateral") {
        if (next.collateral !== before.collateral - operation.collateralAssets)
          fail(
            ctx,
            operation,
            `Collateral "${next.collateral}", expected "${before.collateral - operation.collateralAssets}"`,
          );
        // Debt-free after a full repay allows zero collateral.
        const risk =
          next.borrowShares === 0n
            ? {
                ltvWad: { type: "debtFree" } as RiskMetric,
                healthFactorWad: {
                  type: "unbounded",
                  reason: "zeroCollateral",
                } as RiskMetric,
              }
            : checkLtv(
                ctx,
                operation,
                next,
                marketAfterEntity,
                internalsAfter.params.lltv,
              );
        for (const limit of limitsFor(
          ctx,
          "blueRepayWithdrawCollateral",
          operation,
        )) {
          if (
            limit.marketId.toLowerCase() !==
            operation.market.marketId.toLowerCase()
          )
            limitViolation(
              ctx,
              operation,
              "marketId",
              limit.marketId,
              operation.market.marketId,
              "The bundle does not match the declared constraint.",
            );
          if (
            limit.expectedWithdrawAssets !== undefined &&
            limit.expectedWithdrawAssets !== operation.collateralAssets
          )
            limitViolation(
              ctx,
              operation,
              "expectedWithdrawAssets",
              `${limit.expectedWithdrawAssets}`,
              `${operation.collateralAssets}`,
              "The bundle does not match the declared constraint.",
            );
          if (
            limit.expectedOnBehalf !== undefined &&
            !eq(limit.expectedOnBehalf, operation.onBehalf)
          )
            limitViolation(
              ctx,
              operation,
              "expectedOnBehalf",
              limit.expectedOnBehalf,
              operation.onBehalf,
              "The bundle does not match the declared constraint.",
            );
          if (
            limit.expectedReceiver !== undefined &&
            !eq(limit.expectedReceiver, operation.receiver)
          )
            limitViolation(
              ctx,
              operation,
              "expectedReceiver",
              limit.expectedReceiver,
              operation.receiver,
              "The bundle does not match the declared constraint.",
            );
          if (
            limit.expectedFullClose !== undefined &&
            limit.expectedFullClose !== operation.fullClose
          )
            limitViolation(
              ctx,
              operation,
              "expectedFullClose",
              `${limit.expectedFullClose}`,
              `${operation.fullClose}`,
              "The bundle does not match the declared constraint.",
            );
          if (
            limit.maxAssetsPaid !== undefined &&
            assetsPaid > limit.maxAssetsPaid
          )
            limitViolation(
              ctx,
              operation,
              "maxAssetsPaid",
              `${limit.maxAssetsPaid}`,
              `${assetsPaid}`,
              "Increase the bound or reduce the operation.",
            );
          if (
            limit.minBorrowSharesBurned !== undefined &&
            sharesBurned < limit.minBorrowSharesBurned
          )
            limitViolation(
              ctx,
              operation,
              "minBorrowSharesBurned",
              `${limit.minBorrowSharesBurned}`,
              `${sharesBurned}`,
              "Decrease the bound or adjust the operation.",
            );
          if (
            limit.maxResidualBorrowShares !== undefined &&
            next.borrowShares > limit.maxResidualBorrowShares
          )
            limitViolation(
              ctx,
              operation,
              "maxResidualBorrowShares",
              `${limit.maxResidualBorrowShares}`,
              `${next.borrowShares}`,
              "Increase the bound or reduce the operation.",
            );
          if (limit.minRefundAssets !== undefined && 0n < limit.minRefundAssets)
            limitViolation(
              ctx,
              operation,
              "minRefundAssets",
              `${limit.minRefundAssets}`,
              "0",
              "Decrease the bound or adjust the operation.",
            );
          const ltv = riskMetricWad(risk.ltvWad);
          if (
            limit.maxLtvAfterWad !== undefined &&
            (ltv === null || ltv > limit.maxLtvAfterWad)
          )
            limitViolation(
              ctx,
              operation,
              "maxLtvAfterWad",
              `${limit.maxLtvAfterWad}`,
              fmtRisk(risk.ltvWad),
              "Increase the bound or reduce the operation.",
            );
          const health = riskMetricWad(risk.healthFactorWad);
          if (
            limit.minHealthFactorAfterWad !== undefined &&
            health !== null &&
            health < limit.minHealthFactorAfterWad
          )
            limitViolation(
              ctx,
              operation,
              "minHealthFactorAfterWad",
              `${limit.minHealthFactorAfterWad}`,
              fmtRisk(risk.healthFactorWad),
              "Decrease the bound or adjust the operation.",
            );
        }
        return {
          operation,
          outcome: {
            assetsPaid,
            borrowSharesBurned: sharesBurned,
            residualBorrowShares: next.borrowShares,
            refundAssets: 0n,
            ltvAfterWad: risk.ltvWad,
            healthFactorAfterWad: risk.healthFactorWad,
          },
        };
      }
      for (const limit of limitsFor(ctx, "blueRepay", operation)) {
        if (
          limit.marketId.toLowerCase() !==
          operation.market.marketId.toLowerCase()
        )
          limitViolation(
            ctx,
            operation,
            "marketId",
            limit.marketId,
            operation.market.marketId,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedOnBehalf !== undefined &&
          !eq(limit.expectedOnBehalf, operation.onBehalf)
        )
          limitViolation(
            ctx,
            operation,
            "expectedOnBehalf",
            limit.expectedOnBehalf,
            operation.onBehalf,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.expectedFullClose !== undefined &&
          limit.expectedFullClose !== operation.fullClose
        )
          limitViolation(
            ctx,
            operation,
            "expectedFullClose",
            `${limit.expectedFullClose}`,
            `${operation.fullClose}`,
            "The bundle does not match the declared constraint.",
          );
        if (
          limit.maxAssetsPaid !== undefined &&
          assetsPaid > limit.maxAssetsPaid
        )
          limitViolation(
            ctx,
            operation,
            "maxAssetsPaid",
            `${limit.maxAssetsPaid}`,
            `${assetsPaid}`,
            "Increase the bound or reduce the operation.",
          );
        if (
          limit.minBorrowSharesBurned !== undefined &&
          sharesBurned < limit.minBorrowSharesBurned
        )
          limitViolation(
            ctx,
            operation,
            "minBorrowSharesBurned",
            `${limit.minBorrowSharesBurned}`,
            `${sharesBurned}`,
            "Decrease the bound or adjust the operation.",
          );
        if (
          limit.maxResidualBorrowShares !== undefined &&
          next.borrowShares > limit.maxResidualBorrowShares
        )
          limitViolation(
            ctx,
            operation,
            "maxResidualBorrowShares",
            `${limit.maxResidualBorrowShares}`,
            `${next.borrowShares}`,
            "Increase the bound or reduce the operation.",
          );
        if (limit.minRefundAssets !== undefined && 0n < limit.minRefundAssets)
          limitViolation(
            ctx,
            operation,
            "minRefundAssets",
            `${limit.minRefundAssets}`,
            "0",
            "Decrease the bound or adjust the operation.",
          );
      }
      return {
        operation,
        outcome: {
          assetsPaid,
          borrowSharesBurned: sharesBurned,
          residualBorrowShares: next.borrowShares,
          refundAssets: 0n,
        },
      };
    }

    default: {
      const _exhaustive: never = operation;
      throw new UnexpectedSimulationError(
        `checkBlueOperation received an unhandled operation type: ${JSON.stringify(_exhaustive)}`,
        { context: opContext(ctx, operation as DecodedOperation) },
      );
    }
  }
}

/** Funding debit overrides for repay legs pulling capped amounts. @internal */
export function fundingDebitOverrides(
  operations: readonly DecodedOperation[],
  accruedBefore: ParsedState,
): Map<DecodedOperation, bigint> {
  const overrides = new Map<DecodedOperation, bigint>();
  for (const op of operations) {
    if (
      (op.type !== "blueRepay" && op.type !== "blueRepayWithdrawCollateral") ||
      op.funding.type === "none"
    )
      continue;
    const marketState = accruedBefore.markets.find(
      (m) => m.marketId === op.market.marketId,
    );
    const internals = accruedBefore.internals.markets.get(op.market.marketId);
    if (marketState == null || internals == null) continue;
    const entity = toMarketEntity(marketState, internals);
    const paid =
      op.repay.type === "assets"
        ? op.repay.assets
        : entity.toBorrowAssets(op.repay.shares, "Up");
    overrides.set(op, paid);
  }
  return overrides;
}
