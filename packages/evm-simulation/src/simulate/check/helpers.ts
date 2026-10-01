import {
  _try,
  AccrualPosition,
  Market,
  type MarketId,
  MathLib,
  SECONDS_PER_YEAR,
} from "@morpho-org/blue-sdk";
import type { ChainAddresses } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import {
  ConsumerLimitViolationError,
  MarketConstraintViolationError,
  type SimulationErrorContext,
  StateChangeMismatchError,
} from "../../errors.js";
import type {
  OperationLimit,
  SimulationOperationSubject,
} from "../../limits.js";
import type { SimulationMode } from "../../params.js";
import type {
  MarketState,
  PositionState,
  SimulationStateChange,
  VaultState,
} from "../../result.js";
import type { ExecutionBlock } from "../backends/parse-response.js";
import type {
  MarketInternals,
  ParsedState,
  RiskMetric,
} from "../state/types.js";

/** Case-insensitive address equality. @internal */
export const eq = (a: Address, b: Address) => isAddressEqual(a, b);

/** Context every check receives. @internal */
export interface CheckContext {
  readonly chainId: number;
  readonly mode: SimulationMode;
  readonly block: ExecutionBlock;
  readonly owner: Address;
  readonly limits: {
    readonly maxSlippageWad: bigint;
    readonly minLltvBufferWad: bigint;
    readonly maxSignatureLifetimeSeconds: bigint;
    readonly operations: readonly OperationLimit[];
  };
  readonly addresses: ChainAddresses;
}

/** The operation subject (`operation` + entity keys) of one declared limit. @internal */
export const operationSubject = (
  op: OperationLimit,
): SimulationOperationSubject => {
  switch (op.type) {
    case "blueSupply":
    case "blueWithdraw":
    case "blueSupplyCollateral":
    case "blueBorrow":
    case "blueSupplyCollateralBorrow":
    case "blueRepay":
    case "blueWithdrawCollateral":
    case "blueRepayWithdrawCollateral":
      return { operation: op.type, marketId: op.marketId };
    case "blueRefinance":
      return {
        operation: "blueRefinance",
        sourceMarketId: op.sourceMarketId,
        targetMarketId: op.targetMarketId,
      };
    case "blueAuthorization":
      return { operation: "blueAuthorization", authorized: op.authorized };
    case "vaultV1MigrateToV2":
      return {
        operation: "vaultV1MigrateToV2",
        sourceVault: op.sourceVault,
        targetVault: op.targetVault,
      };
    case "vaultV2ForceWithdraw":
      return {
        operation: "vaultV2ForceWithdraw",
        vault: op.vault,
        adapter: op.expectedAdapter,
      };
    default:
      return { operation: op.type, vault: op.vault };
  }
};

/** Verification context bound to one declared operation limit. @internal */
// biome-ignore lint/complexity/useMaxParams: context builders read clearest with positional arguments
export const opContext = (
  ctx: CheckContext,
  op: OperationLimit,
  extra: {
    readonly token?: Address;
    readonly account?: Address;
    readonly spender?: Address;
    readonly field?: string;
    readonly expected?: bigint | boolean | Address | `0x${string}`;
    readonly observed?: bigint | boolean | Address | `0x${string}`;
  } = {},
): SimulationErrorContext => ({
  stage: "verification",
  chainId: ctx.chainId,
  mode: ctx.mode,
  blockNumber: ctx.block.blockNumber,
  ...operationSubject(op),
  failedTransactionIndex: op.transactionIndex,
  ...extra,
});

/** Verification context for a check not bound to one operation. @internal */
// biome-ignore lint/complexity/useMaxParams: context builders read clearest with positional arguments
export const checkContext = (
  ctx: CheckContext,
  field: string,
  extra: {
    readonly token?: Address;
    readonly account?: Address;
    readonly spender?: Address;
    readonly expected?: bigint | boolean | Address | `0x${string}`;
    readonly observed?: bigint | boolean | Address | `0x${string}`;
    readonly failedTransactionIndex?: number;
  } = {},
): SimulationErrorContext => ({
  stage: "verification",
  chainId: ctx.chainId,
  mode: ctx.mode,
  blockNumber: ctx.block.blockNumber,
  field,
  ...extra,
});

/** Throw a {@link StateChangeMismatchError} for one operation. @internal */
// biome-ignore lint/complexity/useMaxParams: throw helpers read clearest with positional arguments
export const fail = (
  ctx: CheckContext,
  op: OperationLimit,
  message: string,
): never => {
  throw new StateChangeMismatchError(message, { context: opContext(ctx, op) });
};

/** Throw a {@link MarketConstraintViolationError} for one operation. @internal */
// biome-ignore lint/complexity/useMaxParams: throw helpers read clearest with positional arguments
const constraint = (
  ctx: CheckContext,
  op: OperationLimit,
  message: string,
): never => {
  throw new MarketConstraintViolationError(message, {
    context: opContext(ctx, op),
  });
};

/** Look up one position state, failing when the subject was never read. @internal */
// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
export const findPosition = (
  state: ParsedState | { readonly positions: readonly PositionState[] },
  marketId: MarketId,
  owner: Address,
  ctx: CheckContext,
  op: OperationLimit,
): PositionState =>
  state.positions.find((p) => p.marketId === marketId && eq(p.user, owner)) ??
  fail(ctx, op, `Position ${marketId}:${owner} missing from read state`);

/** Look up one market state, failing when the subject was never read. @internal */
// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
export const findMarket = (
  state: { readonly markets: readonly MarketState[] },
  marketId: MarketId,
  ctx: CheckContext,
  op: OperationLimit,
): MarketState =>
  state.markets.find((m) => m.marketId === marketId) ??
  fail(ctx, op, `Market ${marketId} missing from read state`);

/** Look up one vault state, failing when the subject was never read. @internal */
// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
export const findVault = (
  state: { readonly vaults: readonly VaultState[] },
  vault: Address,
  ctx: CheckContext,
  op: OperationLimit,
): VaultState =>
  state.vaults.find((v) => eq(v.vault, vault)) ??
  fail(ctx, op, `Vault ${vault} missing from read state`);

/** Sum a wallet diff over one (account, token) pair. @internal */
// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
export const receiverCredit = (
  diff: SimulationStateChange,
  account: Address,
  token: Address,
): bigint =>
  diff.balances
    .filter((c) => eq(c.account, account) && eq(c.token, token))
    .reduce((total, c) => total + c.assets, 0n);

/**
 * Rebuild a blue-sdk {@link Market} entity from a read market state plus its
 * internals, so SDK getters and share math apply without re-implementing
 * formulas. Oracle price and IRM rate attach only when the state carried them.
 * @internal
 */
export const toMarketEntity = (
  state: MarketState,
  internals: MarketInternals,
): Market =>
  new Market({
    params: internals.params,
    totalSupplyAssets: state.totalSupplyAssets,
    totalSupplyShares: state.totalSupplyShares,
    totalBorrowAssets: state.totalBorrowAssets,
    totalBorrowShares: state.totalBorrowShares,
    lastUpdate: state.lastUpdate,
    fee: state.feeWad,
    price: state.oraclePrice,
    rateAtTarget: internals.rateAtTargetPerSecondWad,
  });

/** LTV/health metrics of a position on a market state, via AccrualPosition. @internal */
export const riskOn = (
  position: PositionState,
  market: Market,
): { ltvWad: RiskMetric; healthFactorWad: RiskMetric } => {
  const accrual = new AccrualPosition(
    {
      user: position.user,
      supplyShares: position.supplyShares,
      borrowShares: position.borrowShares,
      collateral: position.collateral,
    },
    market,
  );
  const ltv = _try(() => accrual.ltv);
  const healthFactor = _try(() => accrual.healthFactor);
  return {
    ltvWad:
      ltv == null || ltv === 0n
        ? { type: "debtFree" }
        : { type: "finite", valueWad: ltv },
    healthFactorWad:
      healthFactor == null
        ? { type: "unbounded", reason: "zeroCollateral" }
        : { type: "finite", valueWad: healthFactor },
  };
};

/** LTV-after check: debt > 0 requires ltv ≤ lltv − minLltvBufferWad. @internal */
// biome-ignore lint/complexity/useMaxParams: check helpers read clearest with positional arguments
export const checkLtv = (
  ctx: CheckContext,
  op: OperationLimit,
  position: PositionState,
  market: Market,
  lltvWad: bigint,
): { ltvWad: RiskMetric; healthFactorWad: RiskMetric } => {
  const risk = riskOn(position, market);
  if (position.borrowShares === 0n) return risk;
  if (position.collateral === 0n)
    constraint(
      ctx,
      op,
      `Position holds debt "${position.borrowShares}" borrow share(s) with zero collateral`,
    );
  if (risk.ltvWad.type !== "finite") return risk;
  const bound = lltvWad - ctx.limits.minLltvBufferWad;
  if (risk.ltvWad.valueWad > bound)
    constraint(
      ctx,
      op,
      `Post-operation LTV "${risk.ltvWad.valueWad}" exceeds LLTV "${lltvWad}" minus buffer "${ctx.limits.minLltvBufferWad}"`,
    );
  return risk;
};

/** Utilization of a market state as a finite metric (unbounded without supply). @internal */
export const utilizationAfter = (market: Market): RiskMetric => {
  const utilization = _try(() => market.utilization);
  return utilization == null || market.totalSupplyAssets === 0n
    ? { type: "unbounded", reason: "zeroLiquidity" }
    : { type: "finite", valueWad: utilization };
};

/** Compounded borrow APY at the market's instantaneous end rate, WAD-scaled. @internal */
export const borrowApyAfter = (market: Market): bigint => {
  const rate = _try(() => market.endBorrowRate);
  return rate == null ? 0n : MathLib.wTaylorCompounded(rate, SECONDS_PER_YEAR);
};

/** Format a {@link RiskMetric} for limit-violation messages. @internal */
export const fmtRisk = (metric: RiskMetric): string =>
  metric.type === "finite" ? `${metric.valueWad}` : metric.type;

/** Numeric value of a {@link RiskMetric}; `null` when non-finite. @internal */
export const riskMetricWad = (metric: RiskMetric): bigint | null =>
  metric.type === "finite" ? metric.valueWad : null;

/**
 * Throw a {@link ConsumerLimitViolationError} for one pinned limit field;
 * `expected` and `observed` are pre-formatted for the message.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: violation reports need field, bound, observed and hint
export const limitViolation = (
  ctx: CheckContext,
  op: OperationLimit,
  field: string,
  expected: string,
  observed: string,
  hint: string,
): never => {
  throw new ConsumerLimitViolationError(
    `Operation limit "${op.type}.${field}" expected "${expected}", observed "${observed}". ${hint}`,
    {
      context: {
        stage: "verification",
        chainId: ctx.chainId,
        mode: ctx.mode,
        blockNumber: ctx.block.blockNumber,
        ...operationSubject(op),
        field: `${op.type}.${field}`,
        failedTransactionIndex: op.transactionIndex,
      },
    },
  );
};
