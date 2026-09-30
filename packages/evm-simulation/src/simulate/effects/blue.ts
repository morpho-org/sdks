import type { Market } from "@morpho-org/blue-sdk";
import {
  _try,
  AccrualPosition,
  type MarketId,
  MathLib,
  SECONDS_PER_YEAR,
} from "@morpho-org/blue-sdk";
import { type Address, isAddressEqual } from "viem";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type {
  MarketState,
  PositionState,
  RiskMetric,
  VerificationDiff,
  VerificationSnapshot,
} from "../../domain/evidence.js";
import type { EffectiveSimulationLimits } from "../../domain/limits.js";
import type {
  DecodedOperation,
  OperationIdentity,
} from "../../domain/operations.js";
import type { VerifiedOperation } from "../../domain/result.js";
import type { DecodedBundle } from "../../domain/stages.js";
import {
  MarketConstraintViolationError,
  MissingVerificationEvidenceError,
  StateChangeMismatchError,
  UnexpectedSimulationError,
} from "../../errors.js";
import { toMarketEntity } from "./market-entity.js";
import { verifyRefinanceOperation } from "./refinance.js";

const eq = (a: Address, b: Address) => isAddressEqual(a, b);

interface OpContext {
  readonly context: SimulationErrorContext;
  readonly identity: OperationIdentity;
}

const locationOf = (identity: OperationIdentity) => ({
  type: "transaction" as const,
  txIdx: identity.transactionIndex,
  callPath: identity.callPath,
});

const fail = (message: string, { context, identity }: OpContext): never => {
  throw new StateChangeMismatchError(message, {
    ...context,
    location: locationOf(identity),
  });
};

const constraint = (
  message: string,
  { context, identity }: OpContext,
): never => {
  throw new MarketConstraintViolationError(message, {
    ...context,
    location: locationOf(identity),
  });
};

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findPosition = (
  snapshot: VerificationSnapshot,
  marketId: MarketId,
  owner: Address,
  ctx: OpContext,
): PositionState =>
  snapshot.positions.find(
    (p) => p.marketId === marketId && eq(p.owner, owner),
  ) ?? fail(`Position ${marketId}:${owner} missing from snapshot`, ctx);

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findMarket = (
  snapshot: VerificationSnapshot,
  marketId: MarketId,
  ctx: OpContext,
): MarketState =>
  snapshot.markets.find((m) => m.market.marketId === marketId) ??
  fail(`Market ${marketId} missing from snapshot`, ctx);

/** LTV/health metrics of a position on a market state, via AccrualPosition. */
const riskOn = (
  position: PositionState,
  marketState: MarketState,
): { ltvWad: RiskMetric; healthFactorWad: RiskMetric } => {
  const market = toMarketEntity(marketState);
  const accrual = new AccrualPosition(
    {
      user: position.owner,
      supplyShares: position.supplyShares,
      borrowShares: position.borrowShares,
      collateral: position.collateralAssets,
    },
    market,
  );
  const ltv = _try(() => accrual.ltv);
  const healthFactor = _try(() => accrual.healthFactor);
  return {
    ltvWad:
      ltv == null
        ? position.ltvWad
        : ltv === 0n
          ? { type: "debtFree" }
          : { type: "finite", valueWad: ltv },
    healthFactorWad:
      healthFactor == null
        ? { type: "unbounded", reason: "zeroCollateral" }
        : { type: "finite", valueWad: healthFactor },
  };
};

/** LTV-after check: debt > 0 requires ltv ≤ lltv − minLltvBufferWad. */
// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const checkLtv = (
  position: PositionState,
  marketState: MarketState,
  limits: EffectiveSimulationLimits,
  ctx: OpContext,
): { ltvWad: RiskMetric; healthFactorWad: RiskMetric } => {
  const risk = riskOn(position, marketState);
  if (position.borrowShares === 0n) return risk;
  if (position.collateralAssets === 0n)
    constraint(
      `Position holds debt "${position.borrowShares}" borrow share(s) with zero collateral`,
      ctx,
    );
  if (risk.ltvWad.type !== "finite") return risk;
  const bound = marketState.market.params.lltv - limits.minLltvBufferWad;
  if (risk.ltvWad.valueWad > bound)
    constraint(
      `Post-operation LTV "${risk.ltvWad.valueWad}" exceeds LLTV "${marketState.market.params.lltv}" minus buffer "${limits.minLltvBufferWad}"`,
      ctx,
    );
  return risk;
};

const utilizationAfter = (market: MarketState): RiskMetric => {
  const entity = toMarketEntity(market);
  const utilization = _try(() => entity.utilization);
  return utilization == null
    ? market.utilizationWad
    : { type: "finite", valueWad: utilization };
};

/** Compounded borrow APY at the market's instantaneous end rate, WAD-scaled. */
/**
 * Penalty charged by Vault V2 `forceDeallocate` for a decoded reallocation
 * list: the independently-rounded sum Σ wMulUp(assets, penaltyWad), matching
 * {@link VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets}. Penalties
 * burn caller vault shares; the asset-side proxy is the penalized leg amount.
 * @internal
 */
const reallocationPenalty = (
  reallocations: readonly {
    readonly assets: bigint;
    readonly penaltyWad: bigint;
  }[],
): bigint =>
  reallocations.reduce(
    (total, r) => total + MathLib.wMulUp(r.assets, r.penaltyWad),
    0n,
  );

const borrowApyAfter = (market: MarketState): bigint => {
  const entity = toMarketEntity(market);
  const rate = _try(() => entity.endBorrowRate);
  return rate == null ? 0n : MathLib.wTaylorCompounded(rate, SECONDS_PER_YEAR);
};

/**
 * Verify one Blue-bundle operation's effects on the owner's position and the
 * market, against `accruedBefore → after` (design §13). All share/asset
 * math delegates to blue-sdk {@link Market} converters and
 * {@link AccrualPosition} risk getters.
 *
 * @internal
 */
export function verifyBlueOperation(params: {
  readonly bundle: DecodedBundle;
  readonly operation: Extract<
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
  >;
  readonly before: VerificationSnapshot;
  readonly accruedBefore: VerificationSnapshot;
  readonly after: VerificationSnapshot;
  readonly actionDiff: VerificationDiff;
  readonly limits: EffectiveSimulationLimits;
  readonly context: SimulationErrorContext;
}): VerifiedOperation {
  const { operation, accruedBefore, after, limits, context } = params;
  const ctx: OpContext = {
    context,
    identity: {
      transactionIndex: operation.transactionIndex,
      callPath: operation.callPath,
    },
  };

  if (operation.type === "blueAuthorization") {
    return {
      operation,
      outcome: { isAuthorized: operation.isAuthorized },
    } as VerifiedOperation;
  }

  if (operation.type === "blueRefinance") {
    return verifyRefinanceOperation({ ...params, operation });
  }

  const marketId = operation.market.marketId;
  const marketBefore = findMarket(accruedBefore, marketId, ctx);
  const marketAfter = findMarket(after, marketId, ctx);
  const before = findPosition(accruedBefore, marketId, operation.onBehalf, ctx);
  const next = findPosition(after, marketId, operation.onBehalf, ctx);
  const market = toMarketEntity(marketBefore);

  const oraclePresent = marketBefore.oraclePrice.type === "applicable";
  const irmPresent = marketBefore.borrowRatePerSecondWad.type === "applicable";

  switch (operation.type) {
    case "blueSupply": {
      const shares = market.toSupplyShares(operation.assets, "Down");
      const expectedShares = before.supplyShares + shares;
      if (next.supplyShares !== expectedShares)
        fail(
          `Supply shares "${next.supplyShares}", expected "${expectedShares}" (before "${before.supplyShares}" + "${shares}")`,
          ctx,
        );
      const minAssets = operation.assets === 0n ? 0n : operation.assets - 1n;
      if (next.supplyAssets - before.supplyAssets < minAssets)
        fail(
          `Supply assets grew by "${next.supplyAssets - before.supplyAssets}", below "${minAssets}"`,
          ctx,
        );
      if (next.borrowShares !== before.borrowShares)
        fail("Supply must not change borrow shares", ctx);
      if (next.collateralAssets !== before.collateralAssets)
        fail("Supply must not change collateral", ctx);
      const supplyDelta =
        marketAfter.totalSupplyAssets - marketBefore.totalSupplyAssets;
      if (supplyDelta !== operation.assets)
        fail(
          `Market supply grew by "${supplyDelta}", expected "${operation.assets}"`,
          ctx,
        );
      return {
        operation,
        outcome: { supplySharesMinted: shares },
      } as VerifiedOperation;
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
          `Supply shares "${next.supplyShares}", expected "${before.supplyShares - sharesBurned}"`,
          ctx,
        );
      const liquidityDelta =
        marketAfter.liquidityAssets - marketBefore.liquidityAssets;
      if (liquidityDelta !== -assetsOut)
        fail(
          `Market liquidity moved "${liquidityDelta}", expected "${-assetsOut}"`,
          ctx,
        );
      if (operation.fullClose && next.supplyShares !== 0n)
        fail(`Full withdraw left "${next.supplyShares}" supply shares`, ctx);
      return {
        operation,
        outcome: {
          assetsReceived: assetsOut,
          supplySharesBurned: sharesBurned,
          utilizationAfterWad: utilizationAfter(marketAfter),
          reallocationPenaltyAssets: reallocationPenalty(
            operation.reallocations ?? [],
          ),
        },
      } as VerifiedOperation;
    }

    case "blueSupplyCollateral": {
      if (
        next.collateralAssets !==
        before.collateralAssets + operation.collateralAssets
      )
        fail(
          `Collateral "${next.collateralAssets}", expected "${before.collateralAssets + operation.collateralAssets}"`,
          ctx,
        );
      if (next.supplyShares !== before.supplyShares)
        fail("SupplyCollateral must not change supply", ctx);
      if (next.borrowShares !== before.borrowShares)
        fail("SupplyCollateral must not change borrow", ctx);
      return {
        operation,
        outcome: { ltvAfterWad: riskOn(next, marketAfter).ltvWad },
      } as VerifiedOperation;
    }

    case "blueWithdrawCollateral": {
      if (
        next.collateralAssets !==
        before.collateralAssets - operation.collateralAssets
      )
        fail(
          `Collateral "${next.collateralAssets}", expected "${before.collateralAssets - operation.collateralAssets}"`,
          ctx,
        );
      const risk = checkLtv(next, marketAfter, limits, ctx);
      return {
        operation,
        outcome: {
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
        },
      } as VerifiedOperation;
    }

    case "blueBorrow": {
      if (!oraclePresent || !irmPresent)
        throw new MissingVerificationEvidenceError(
          `Borrow on market "${marketId}" requires oracle and IRM reads; one is notApplicable`,
          context,
        );
      const shares = market.toBorrowShares(operation.borrowAssets, "Up");
      if (next.borrowShares !== before.borrowShares + shares)
        fail(
          `Borrow shares "${next.borrowShares}", expected "${before.borrowShares + shares}"`,
          ctx,
        );
      const liquidityDelta =
        marketAfter.liquidityAssets - marketBefore.liquidityAssets;
      if (liquidityDelta !== -operation.borrowAssets)
        fail(
          `Market liquidity moved "${liquidityDelta}", expected "${-operation.borrowAssets}"`,
          ctx,
        );
      const risk = checkLtv(next, marketAfter, limits, ctx);
      return {
        operation,
        outcome: {
          borrowSharesMinted: shares,
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
          utilizationAfterWad: utilizationAfter(marketAfter),
          borrowApyAfterWad: borrowApyAfter(marketAfter),
          reallocationPenaltyAssets: reallocationPenalty(
            operation.reallocations ?? [],
          ),
        },
      } as VerifiedOperation;
    }

    case "blueSupplyCollateralBorrow": {
      if (
        next.collateralAssets !==
        before.collateralAssets + operation.collateralAssets
      )
        fail(
          `Collateral "${next.collateralAssets}", expected "${before.collateralAssets + operation.collateralAssets}"`,
          ctx,
        );
      const shares = market.toBorrowShares(operation.borrowAssets, "Up");
      if (next.borrowShares !== before.borrowShares + shares)
        fail(
          `Borrow shares "${next.borrowShares}", expected "${before.borrowShares + shares}"`,
          ctx,
        );
      const risk = checkLtv(next, marketAfter, limits, ctx);
      return {
        operation,
        outcome: {
          borrowSharesMinted: shares,
          ltvAfterWad: risk.ltvWad,
          healthFactorAfterWad: risk.healthFactorWad,
          utilizationAfterWad: utilizationAfter(marketAfter),
          borrowApyAfterWad: borrowApyAfter(marketAfter),
          reallocationPenaltyAssets: reallocationPenalty(
            operation.reallocations ?? [],
          ),
        },
      } as VerifiedOperation;
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
          `Repay burned "${sharesBurned}" shares, more than the "${before.borrowShares}" owed`,
          ctx,
        );
      if (next.borrowShares !== residual)
        fail(
          `Residual borrow shares "${next.borrowShares}", expected "${residual}"`,
          ctx,
        );
      if (operation.fullClose && next.borrowShares !== 0n)
        throw new StateChangeMismatchError(
          `Full repay left "${next.borrowShares}" borrow shares`,
          context,
        );
      if (operation.type === "blueRepayWithdrawCollateral") {
        if (
          next.collateralAssets !==
          before.collateralAssets - operation.collateralAssets
        )
          fail(
            `Collateral "${next.collateralAssets}", expected "${before.collateralAssets - operation.collateralAssets}"`,
            ctx,
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
            : checkLtv(next, marketAfter, limits, ctx);
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
        } as VerifiedOperation;
      }
      return {
        operation,
        outcome: {
          assetsPaid,
          borrowSharesBurned: sharesBurned,
          residualBorrowShares: next.borrowShares,
          refundAssets: 0n,
        },
      } as VerifiedOperation;
    }

    default: {
      const _exhaustive: never = operation;
      throw new UnexpectedSimulationError(
        `verifyBlueOperation received an unhandled operation type: ${JSON.stringify(_exhaustive)}`,
        context,
      );
    }
  }
}

/**
 * Reject unrelated state changes: any position or market in `after` that
 * differs from `accruedBefore` while no decoded operation touched it.
 * @internal
 */
export function checkUnrelatedState(params: {
  readonly accruedBefore: VerificationSnapshot;
  readonly after: VerificationSnapshot;
  readonly touchedMarketIds: ReadonlySet<MarketId>;
  readonly context: SimulationErrorContext;
}): void {
  const { accruedBefore, after, touchedMarketIds, context } = params;
  for (const position of after.positions) {
    if (touchedMarketIds.has(position.marketId)) continue;
    const prior = accruedBefore.positions.find(
      (p) => p.marketId === position.marketId && eq(p.owner, position.owner),
    );
    if (prior == null) continue;
    if (
      prior.supplyShares !== position.supplyShares ||
      prior.borrowShares !== position.borrowShares ||
      prior.collateralAssets !== position.collateralAssets
    ) {
      throw new StateChangeMismatchError(
        `Unrelated position ${position.marketId}:${position.owner} changed during the bundle`,
        context,
      );
    }
  }
  for (const market of after.markets) {
    if (touchedMarketIds.has(market.market.marketId)) continue;
    const prior = accruedBefore.markets.find(
      (m) => m.market.marketId === market.market.marketId,
    );
    if (prior == null) continue;
    if (
      prior.totalSupplyAssets !== market.totalSupplyAssets ||
      prior.totalSupplyShares !== market.totalSupplyShares ||
      prior.totalBorrowAssets !== market.totalBorrowAssets ||
      prior.totalBorrowShares !== market.totalBorrowShares
    ) {
      throw new StateChangeMismatchError(
        `Unrelated market ${market.market.marketId} totals changed during the bundle`,
        context,
      );
    }
  }
}
