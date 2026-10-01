import { ethAddress } from "viem";
import type { DecodedOperation } from "../../decode/operation.js";
import {
  MissingVerificationEvidenceError,
  StateChangeMismatchError,
  UnexpectedSimulationError,
} from "../../errors.js";
import type { ParsedState, RiskMetric } from "../state/types.js";
import {
  borrowApyAfter,
  type CheckContext,
  type CheckedOperation,
  checkLtv,
  fail,
  findMarket,
  findPosition,
  opContext,
  reallocationPenalty,
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
): CheckedOperation {
  if (operation.type === "blueAuthorization") {
    return {
      operation,
      outcome: { isAuthorized: operation.isAuthorized },
    } as CheckedOperation;
  }

  if (operation.type === "blueRefinance") {
    return checkRefinanceOperation(ctx, operation, accruedBefore, after);
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
      return {
        operation,
        outcome: { supplySharesMinted: shares },
      } as CheckedOperation;
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
      return {
        operation,
        outcome: {
          assetsReceived: assetsOut,
          supplySharesBurned: sharesBurned,
          utilizationAfterWad: utilizationAfter(marketAfterEntity),
          reallocationPenaltyAssets: reallocationPenalty(
            operation.reallocations ?? [],
          ),
        },
      } as CheckedOperation;
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
      return {
        operation,
        outcome: { ltvAfterWad: riskOn(next, marketAfterEntity).ltvWad },
      } as CheckedOperation;
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
      return {
        operation,
        outcome: {
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
        },
      } as CheckedOperation;
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
      return {
        operation,
        outcome: {
          borrowSharesMinted: shares,
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
          utilizationAfterWad: utilizationAfter(marketAfterEntity),
          borrowApyAfterWad: borrowApyAfter(marketAfterEntity),
          reallocationPenaltyAssets: reallocationPenalty(
            operation.reallocations ?? [],
          ),
        },
      } as CheckedOperation;
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
      return {
        operation,
        outcome: {
          borrowSharesMinted: shares,
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
          utilizationAfterWad: utilizationAfter(marketAfterEntity),
          borrowApyAfterWad: borrowApyAfter(marketAfterEntity),
          reallocationPenaltyAssets: reallocationPenalty(
            operation.reallocations ?? [],
          ),
        },
      } as CheckedOperation;
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
        } as CheckedOperation;
      }
      return {
        operation,
        outcome: {
          assetsPaid,
          borrowSharesBurned: sharesBurned,
          residualBorrowShares: next.borrowShares,
          refundAssets: 0n,
        },
      } as CheckedOperation;
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
// biome-ignore lint/complexity/useMaxParams: helpers read clearest with positional arguments
export function fundingDebitOverrides(
  operations: readonly DecodedOperation[],
  accruedBefore: ParsedState,
  owner: `0x${string}`,
): Map<string, bigint> {
  const overrides = new Map<string, bigint>();
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
    const token = op.funding.type === "erc20" ? op.funding.token : ethAddress;
    const key = `${owner.toLowerCase()}:${token.toLowerCase()}`;
    overrides.set(key, (overrides.get(key) ?? 0n) + paid);
  }
  return overrides;
}
