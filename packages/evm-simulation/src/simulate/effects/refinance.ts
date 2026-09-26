import {
  _try,
  AccrualPosition,
  type MarketId,
  MathLib,
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
  ProtocolBindingMismatchError,
  SlippageLimitExceededError,
  StateChangeMismatchError,
} from "../../errors.js";
import { toMarketEntity } from "./market-entity.js";

const eq = (a: Address, b: Address) => isAddressEqual(a, b);

interface Ctx {
  readonly context: SimulationErrorContext;
  readonly identity: OperationIdentity;
}

const locationOf = (identity: OperationIdentity) => ({
  type: "transaction" as const,
  txIdx: identity.transactionIndex,
  callPath: identity.callPath,
});

const fail = (message: string, { context, identity }: Ctx): never => {
  throw new StateChangeMismatchError(message, {
    ...context,
    location: locationOf(identity),
  });
};

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findPosition = (
  snapshot: VerificationSnapshot,
  marketId: MarketId,
  owner: Address,
  ctx: Ctx,
): PositionState =>
  snapshot.positions.find(
    (p) => p.marketId === marketId && eq(p.owner, owner),
  ) ?? fail(`Position ${marketId}:${owner} missing from snapshot`, ctx);

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findMarket = (
  snapshot: VerificationSnapshot,
  marketId: MarketId,
  ctx: Ctx,
): MarketState =>
  snapshot.markets.find((m) => m.market.marketId === marketId) ??
  fail(`Market ${marketId} missing from snapshot`, ctx);

const riskOn = (
  position: PositionState,
  marketState: MarketState,
): { ltvWad: RiskMetric; healthFactorWad: RiskMetric } => {
  const accrual = new AccrualPosition(
    {
      user: position.owner,
      supplyShares: position.supplyShares,
      borrowShares: position.borrowShares,
      collateral: position.collateralAssets,
    },
    toMarketEntity(marketState),
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

/**
 * Verify `blueRefinance` against the decoded bindings (design §13).
 *
 * Source market: `sourceFullClose` means borrow shares and collateral must
 * drain to exactly zero — any residual is a `StateChangeMismatchError`.
 * Target market: collateral must equal the moved source collateral exactly,
 * and the minted borrow shares must equal `toBorrowShares(newDebt, "Up")`
 * where `newDebt` is the repaid source debt (source borrow assets at the
 * accrued-before market) plus the decoded reallocation penalty.
 * Wallet: the owner's net loan-token change must be zero — a refinance moves
 * debt between markets; the loanDust residual is reported on the outcome.
 *
 * @internal
 */
export function verifyRefinanceOperation(params: {
  readonly bundle: DecodedBundle;
  readonly operation: Extract<DecodedOperation, { type: "blueRefinance" }>;
  readonly before: VerificationSnapshot;
  readonly accruedBefore: VerificationSnapshot;
  readonly after: VerificationSnapshot;
  readonly actionDiff: VerificationDiff;
  readonly limits: EffectiveSimulationLimits;
  readonly context: SimulationErrorContext;
}): VerifiedOperation {
  const { operation, accruedBefore, after, actionDiff, limits, context } =
    params;
  const ctx: Ctx = {
    context,
    identity: {
      transactionIndex: operation.transactionIndex,
      callPath: operation.callPath,
    },
  };

  // Bindings: the decoded markets must be bound markets present in evidence.
  const sourceMarket = operation.sourceMarket;
  const targetMarket = operation.targetMarket;
  if (!after.markets.some((m) => m.market.marketId === sourceMarket.marketId))
    throw new ProtocolBindingMismatchError(
      `Refinance source market "${sourceMarket.marketId}" is not in the verified market set`,
      { ...context, location: locationOf(ctx.identity) },
    );
  if (!after.markets.some((m) => m.market.marketId === targetMarket.marketId))
    throw new ProtocolBindingMismatchError(
      `Refinance target market "${targetMarket.marketId}" is not in the verified market set`,
      { ...context, location: locationOf(ctx.identity) },
    );

  const sourceBefore = findPosition(
    accruedBefore,
    sourceMarket.marketId,
    operation.onBehalf,
    ctx,
  );
  const sourceAfter = findPosition(
    after,
    sourceMarket.marketId,
    operation.onBehalf,
    ctx,
  );
  const targetBefore = findPosition(
    accruedBefore,
    targetMarket.marketId,
    operation.onBehalf,
    ctx,
  );
  const targetAfter = findPosition(
    after,
    targetMarket.marketId,
    operation.onBehalf,
    ctx,
  );

  // Source must fully close.
  if (sourceAfter.borrowShares !== 0n || sourceAfter.collateralAssets !== 0n)
    fail(
      `Refinance source ${sourceMarket.marketId} retains borrow shares "${sourceAfter.borrowShares}" or collateral "${sourceAfter.collateralAssets}" after a full close`,
      ctx,
    );

  const sourceMarketBefore = findMarket(
    accruedBefore,
    sourceMarket.marketId,
    ctx,
  );
  const sourceEntity = toMarketEntity(sourceMarketBefore);
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
    targetAfter.collateralAssets !==
    targetBefore.collateralAssets + sourceBefore.collateralAssets
  )
    fail(
      `Target collateral "${targetAfter.collateralAssets}", expected "${targetBefore.collateralAssets + sourceBefore.collateralAssets}" (moved "${sourceBefore.collateralAssets}")`,
      ctx,
    );

  const targetMarketAfter = findMarket(after, targetMarket.marketId, ctx);
  const targetEntity = toMarketEntity(targetMarketAfter);
  const expectedShares = targetEntity.toBorrowShares(newDebt, "Up");
  const minted = targetAfter.borrowShares - targetBefore.borrowShares;
  if (minted !== expectedShares)
    fail(
      `Target borrow shares minted "${minted}", expected "${expectedShares}" for debt "${newDebt}"`,
      ctx,
    );

  // Target LTV bound.
  const risk = riskOn(targetAfter, targetMarketAfter);
  if (targetAfter.borrowShares > 0n) {
    if (targetAfter.collateralAssets === 0n)
      throw new MarketConstraintViolationError(
        `Refinance target ${targetMarket.marketId} holds debt with zero collateral`,
        { ...context, location: locationOf(ctx.identity) },
      );
    if (risk.ltvWad.type === "finite") {
      const bound = targetMarket.params.lltv - limits.minLltvBufferWad;
      if (risk.ltvWad.valueWad > bound)
        throw new MarketConstraintViolationError(
          `Refinance target LTV "${risk.ltvWad.valueWad}" exceeds LLTV "${targetMarket.params.lltv}" minus buffer "${limits.minLltvBufferWad}"`,
          { ...context, location: locationOf(ctx.identity) },
        );
    }
  }

  // Owner net loan-token change must be zero beyond modeled dust.
  const loanToken = targetMarket.params.loanToken;
  const netLoan = actionDiff.wallet
    .filter((c) => eq(c.account, operation.onBehalf) && eq(c.token, loanToken))
    .reduce((total, c) => total + c.assets, 0n);
  const loanDust = netLoan < 0n ? -netLoan : netLoan;
  const dustBound = MathLib.wMulUp(newDebt, limits.maxSlippageWad);
  if (loanDust > dustBound)
    throw new SlippageLimitExceededError(
      `Refinance loan dust "${loanDust}" exceeds the slippage bound "${dustBound}" (${limits.maxSlippageWad} WAD of new debt "${newDebt}")`,
      { ...context, location: locationOf(ctx.identity) },
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
  } as VerifiedOperation;
}
