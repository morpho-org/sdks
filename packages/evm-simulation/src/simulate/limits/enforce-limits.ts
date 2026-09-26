import type { MarketId } from "@morpho-org/blue-sdk";
import type {
  ConsumerConstraintContext,
  SimulationErrorContext,
} from "../../domain/diagnostics.js";
import type { RiskMetric } from "../../domain/evidence.js";
import type {
  MarketSupplyMinimum,
  OperationLimit,
  OperationLimitFields,
} from "../../domain/limits.js";
import type { DecodedOperation } from "../../domain/operations.js";
import type { VerifiedOperation } from "../../domain/result.js";
import {
  type BoundOperationLimit,
  brandConstrained,
  type ConstrainedEffects,
  type VerifiedEffects,
} from "../../domain/stages.js";
import {
  ConsumerLimitViolationError,
  UnexpectedSimulationError,
} from "../../errors.js";

type OperationType = keyof OperationLimitFields;

/** The decoded operation carried by a verified operation of type `T`. */
type OpOf<T extends OperationType> = Extract<
  DecodedOperation,
  { readonly type: T }
>;

/** The verified outcome carried by a verified operation of type `T`. */
type OutcomeOf<T extends OperationType> = Extract<
  VerifiedOperation,
  { readonly operation: { readonly type: T } }
>["outcome"];

type VerifiedOf<T extends OperationType> = Extract<
  VerifiedOperation,
  { readonly operation: { readonly type: T } }
>;

/**
 * How one operation-limit field is checked: `"equals"` compares a decoded
 * operation field against the declared value (`expected*` semantics plus the
 * identity fields such as `marketId`/`vault`); `"min"`/`"max"` bound a numeric
 * or {@link RiskMetric} outcome field; `"minByMarket"` requires each declared
 * `{marketId, minAssets}` leg to be covered by the observed per-market supply
 * credits.
 */
type FieldBinding<T extends OperationType, V> =
  | { readonly kind: "equals"; readonly read: (op: OpOf<T>) => V | undefined }
  | {
      readonly kind: "min" | "max";
      readonly read: (outcome: OutcomeOf<T>) => bigint | RiskMetric;
    }
  | {
      readonly kind: "minByMarket";
      readonly read: (
        outcome: OutcomeOf<T>,
      ) => readonly { readonly marketId: MarketId; readonly assets: bigint }[];
    };

/**
 * Explicit constraint table — every field of every operation limit is bound
 * to exactly one typed accessor. An unknown limit key or a missing entry is a
 * compile error, so a constraint can never silently degrade into an
 * `undefined` comparison.
 */
const BINDINGS: {
  [T in OperationType]: {
    readonly [F in keyof OperationLimitFields[T]]-?: FieldBinding<
      T,
      NonNullable<OperationLimitFields[T][F]>
    >;
  };
} = {
  blueSupply: {
    marketId: { kind: "equals", read: (op) => op.market.marketId },
    expectedAssets: { kind: "equals", read: (op) => op.assets },
    expectedOnBehalf: { kind: "equals", read: (op) => op.onBehalf },
    minSupplySharesMinted: {
      kind: "min",
      read: (outcome) => outcome.supplySharesMinted,
    },
  },
  blueWithdraw: {
    marketId: { kind: "equals", read: (op) => op.market.marketId },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    expectedFullClose: { kind: "equals", read: (op) => op.fullClose },
    minAssetsReceived: {
      kind: "min",
      read: (outcome) => outcome.assetsReceived,
    },
    maxSupplySharesBurned: {
      kind: "max",
      read: (outcome) => outcome.supplySharesBurned,
    },
    maxUtilizationAfterWad: {
      kind: "max",
      read: (outcome) => outcome.utilizationAfterWad,
    },
    maxReallocationPenaltyAssets: {
      kind: "max",
      read: (outcome) => outcome.reallocationPenaltyAssets,
    },
  },
  blueSupplyCollateral: {
    marketId: { kind: "equals", read: (op) => op.market.marketId },
    expectedAssets: { kind: "equals", read: (op) => op.collateralAssets },
    expectedOnBehalf: { kind: "equals", read: (op) => op.onBehalf },
    maxLtvAfterWad: { kind: "max", read: (outcome) => outcome.ltvAfterWad },
  },
  blueBorrow: {
    marketId: { kind: "equals", read: (op) => op.market.marketId },
    expectedAssets: { kind: "equals", read: (op) => op.borrowAssets },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    maxBorrowSharesMinted: {
      kind: "max",
      read: (outcome) => outcome.borrowSharesMinted,
    },
    maxLtvAfterWad: { kind: "max", read: (outcome) => outcome.ltvAfterWad },
    minHealthFactorAfterWad: {
      kind: "min",
      read: (outcome) => outcome.healthFactorAfterWad,
    },
    maxUtilizationAfterWad: {
      kind: "max",
      read: (outcome) => outcome.utilizationAfterWad,
    },
    maxBorrowApyAfterWad: {
      kind: "max",
      read: (outcome) => outcome.borrowApyAfterWad,
    },
    maxReallocationPenaltyAssets: {
      kind: "max",
      read: (outcome) => outcome.reallocationPenaltyAssets,
    },
  },
  blueSupplyCollateralBorrow: {
    marketId: { kind: "equals", read: (op) => op.market.marketId },
    expectedCollateralAssets: {
      kind: "equals",
      read: (op) => op.collateralAssets,
    },
    expectedBorrowAssets: {
      kind: "equals",
      read: (op) => op.borrowAssets,
    },
    expectedOnBehalf: { kind: "equals", read: (op) => op.onBehalf },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    maxBorrowSharesMinted: {
      kind: "max",
      read: (outcome) => outcome.borrowSharesMinted,
    },
    maxLtvAfterWad: { kind: "max", read: (outcome) => outcome.ltvAfterWad },
    minHealthFactorAfterWad: {
      kind: "min",
      read: (outcome) => outcome.healthFactorAfterWad,
    },
    maxUtilizationAfterWad: {
      kind: "max",
      read: (outcome) => outcome.utilizationAfterWad,
    },
    maxBorrowApyAfterWad: {
      kind: "max",
      read: (outcome) => outcome.borrowApyAfterWad,
    },
    maxReallocationPenaltyAssets: {
      kind: "max",
      read: (outcome) => outcome.reallocationPenaltyAssets,
    },
  },
  blueRepay: {
    marketId: { kind: "equals", read: (op) => op.market.marketId },
    expectedOnBehalf: { kind: "equals", read: (op) => op.onBehalf },
    expectedFullClose: { kind: "equals", read: (op) => op.fullClose },
    maxAssetsPaid: { kind: "max", read: (outcome) => outcome.assetsPaid },
    minBorrowSharesBurned: {
      kind: "min",
      read: (outcome) => outcome.borrowSharesBurned,
    },
    maxResidualBorrowShares: {
      kind: "max",
      read: (outcome) => outcome.residualBorrowShares,
    },
    minRefundAssets: {
      kind: "min",
      read: (outcome) => outcome.refundAssets,
    },
  },
  blueWithdrawCollateral: {
    marketId: { kind: "equals", read: (op) => op.market.marketId },
    expectedAssets: { kind: "equals", read: (op) => op.collateralAssets },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    maxLtvAfterWad: { kind: "max", read: (outcome) => outcome.ltvAfterWad },
    minHealthFactorAfterWad: {
      kind: "min",
      read: (outcome) => outcome.healthFactorAfterWad,
    },
  },
  blueRepayWithdrawCollateral: {
    marketId: { kind: "equals", read: (op) => op.market.marketId },
    expectedWithdrawAssets: {
      kind: "equals",
      read: (op) => op.collateralAssets,
    },
    expectedOnBehalf: { kind: "equals", read: (op) => op.onBehalf },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    expectedFullClose: { kind: "equals", read: (op) => op.fullClose },
    maxAssetsPaid: { kind: "max", read: (outcome) => outcome.assetsPaid },
    minBorrowSharesBurned: {
      kind: "min",
      read: (outcome) => outcome.borrowSharesBurned,
    },
    maxResidualBorrowShares: {
      kind: "max",
      read: (outcome) => outcome.residualBorrowShares,
    },
    minRefundAssets: {
      kind: "min",
      read: (outcome) => outcome.refundAssets,
    },
    maxLtvAfterWad: { kind: "max", read: (outcome) => outcome.ltvAfterWad },
    minHealthFactorAfterWad: {
      kind: "min",
      read: (outcome) => outcome.healthFactorAfterWad,
    },
  },
  blueRefinance: {
    sourceMarketId: {
      kind: "equals",
      read: (op) => op.sourceMarket.marketId,
    },
    targetMarketId: {
      kind: "equals",
      read: (op) => op.targetMarket.marketId,
    },
    expectedSourceFullClose: {
      kind: "equals",
      read: (op) => op.sourceFullClose,
    },
    maxTargetBorrowAssets: {
      kind: "max",
      read: (outcome) => outcome.targetBorrowAssets,
    },
    maxTargetBorrowSharesMinted: {
      kind: "max",
      read: (outcome) => outcome.targetBorrowSharesMinted,
    },
    maxSourceResidualBorrowShares: {
      kind: "max",
      read: (outcome) => outcome.sourceResidualBorrowShares,
    },
    maxTargetLtvAfterWad: {
      kind: "max",
      read: (outcome) => outcome.targetLtvAfterWad,
    },
    minTargetHealthFactorAfterWad: {
      kind: "min",
      read: (outcome) => outcome.targetHealthFactorAfterWad,
    },
    maxLoanDustAssets: {
      kind: "max",
      read: (outcome) => outcome.loanDustAssets,
    },
    maxReallocationPenaltyAssets: {
      kind: "max",
      read: (outcome) => outcome.reallocationPenaltyAssets,
    },
  },
  blueAuthorization: {
    authorized: { kind: "equals", read: (op) => op.authorized },
    expectedIsAuthorized: {
      kind: "equals",
      read: (op) => op.isAuthorized,
    },
  },
  vaultV1Deposit: {
    vault: { kind: "equals", read: (op) => op.vault },
    expectedAssets: {
      kind: "equals",
      read: (op) => op.funding.assets,
    },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    minSharesMinted: {
      kind: "min",
      read: (outcome) => outcome.sharesMinted,
    },
  },
  vaultV2Deposit: {
    vault: { kind: "equals", read: (op) => op.vault },
    expectedAssets: {
      kind: "equals",
      read: (op) => op.funding.assets,
    },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    minSharesMinted: {
      kind: "min",
      read: (outcome) => outcome.sharesMinted,
    },
  },
  vaultV1Withdraw: {
    vault: { kind: "equals", read: (op) => op.vault },
    expectedAssets: { kind: "equals", read: (op) => op.assets },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    maxSharesBurned: {
      kind: "max",
      read: (outcome) => outcome.sharesBurned,
    },
  },
  vaultV2Withdraw: {
    vault: { kind: "equals", read: (op) => op.vault },
    expectedAssets: { kind: "equals", read: (op) => op.assets },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    maxSharesBurned: {
      kind: "max",
      read: (outcome) => outcome.sharesBurned,
    },
  },
  vaultV1Redeem: {
    vault: { kind: "equals", read: (op) => op.vault },
    expectedShares: { kind: "equals", read: (op) => op.shares },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    minAssetsReceived: {
      kind: "min",
      read: (outcome) => outcome.assetsReceived,
    },
  },
  vaultV2Redeem: {
    vault: { kind: "equals", read: (op) => op.vault },
    expectedShares: { kind: "equals", read: (op) => op.shares },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    minAssetsReceived: {
      kind: "min",
      read: (outcome) => outcome.assetsReceived,
    },
  },
  vaultV2ForceWithdraw: {
    vault: { kind: "equals", read: (op) => op.vault },
    expectedExitAssets: { kind: "equals", read: (op) => op.exitAssets },
    expectedAdapter: { kind: "equals", read: (op) => op.adapter },
    maxSharesBurned: {
      kind: "max",
      read: (outcome) => outcome.sharesBurned,
    },
    minAssetsReceived: {
      kind: "min",
      read: (outcome) => outcome.assetsReceived,
    },
    maxPenaltyAssets: {
      kind: "max",
      read: (outcome) => outcome.penaltyAssets,
    },
  },
  vaultV2ForceRedeem: {
    vault: { kind: "equals", read: (op) => op.vault },
    expectedShares: { kind: "equals", read: (op) => op.shares },
    expectedDeallocations: {
      kind: "equals",
      read: (op) => op.deallocations,
    },
    minAssetsReceived: {
      kind: "min",
      read: (outcome) => outcome.assetsReceived,
    },
    maxPenaltyShares: {
      kind: "max",
      read: (outcome) => outcome.penaltyShares,
    },
    maxPenaltyAssets: {
      kind: "max",
      read: (outcome) => outcome.penaltyAssets,
    },
  },
  vaultV1InKindRedeem: {
    vault: { kind: "equals", read: (op) => op.vault },
    expectedAssets: { kind: "equals", read: (op) => op.assets },
    expectedMarketIds: {
      kind: "equals",
      read: (op) => op.markets.map((binding) => binding.marketId),
    },
    maxSharesBurned: {
      kind: "max",
      read: (outcome) => outcome.sharesBurned,
    },
    minIdleAssetsReceived: {
      kind: "min",
      read: (outcome) => outcome.idleAssetsReceived,
    },
    minSupplyAssetsByMarket: {
      kind: "minByMarket",
      read: (outcome) => outcome.supplyAssetsByMarket,
    },
    maxPenaltyAssets: {
      kind: "max",
      read: (outcome) => outcome.penaltyAssets,
    },
    maxResidualShareAllowance: {
      kind: "max",
      read: (outcome) => outcome.residualShareAllowance,
    },
  },
  vaultV2InKindRedeem: {
    vault: { kind: "equals", read: (op) => op.vault },
    expectedAssets: { kind: "equals", read: (op) => op.assets },
    expectedMarketIds: {
      kind: "equals",
      read: (op) => op.markets.map((binding) => binding.marketId),
    },
    maxSharesBurned: {
      kind: "max",
      read: (outcome) => outcome.sharesBurned,
    },
    minIdleAssetsReceived: {
      kind: "min",
      read: (outcome) => outcome.idleAssetsReceived,
    },
    minSupplyAssetsByMarket: {
      kind: "minByMarket",
      read: (outcome) => outcome.supplyAssetsByMarket,
    },
    maxPenaltyAssets: {
      kind: "max",
      read: (outcome) => outcome.penaltyAssets,
    },
    maxResidualShareAllowance: {
      kind: "max",
      read: (outcome) => outcome.residualShareAllowance,
    },
  },
  vaultV1MigrateToV2: {
    sourceVault: { kind: "equals", read: (op) => op.sourceVault },
    targetVault: { kind: "equals", read: (op) => op.targetVault },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    minTargetSharesMinted: {
      kind: "min",
      read: (outcome) => outcome.targetSharesMinted,
    },
    expectedAssets: {
      kind: "equals",
      read: (op) => op.amount.assets,
    },
    expectedShares: {
      kind: "equals",
      read: (op) => op.amount.shares,
    },
  },
};

/** Typed key list for one binding-table entry — no string-path reflection. */
const keysOf = <T extends object>(table: T): (keyof T)[] =>
  Object.keys(table) as (keyof T)[];

const isRiskMetric = (value: unknown): value is RiskMetric =>
  typeof value === "object" && value !== null && "type" in value;

const isDeallocationLike = (
  value: unknown,
): value is { adapter: unknown; marketId?: unknown; amount: unknown } =>
  typeof value === "object" &&
  value !== null &&
  "adapter" in value &&
  "amount" in value;

const isSupplyMinimum = (value: unknown): value is MarketSupplyMinimum =>
  typeof value === "object" &&
  value !== null &&
  "marketId" in value &&
  "minAssets" in value;

/**
 * Element-wise equality without `JSON.stringify`: hex strings compare
 * case-insensitively (covers `Address` and `MarketId`), bigint/boolean/number
 * compare by `===`, arrays recurse element-wise, and deallocation-like
 * records compare on `adapter`/`marketId`/`amount` only.
 */
const valuesEqual = (expected: unknown, observed: unknown): boolean => {
  if (typeof expected === "string" && typeof observed === "string")
    return expected.toLowerCase() === observed.toLowerCase();
  if (Array.isArray(expected) && Array.isArray(observed))
    return (
      expected.length === observed.length &&
      expected.every((entry, index) => valuesEqual(entry, observed[index]))
    );
  if (isDeallocationLike(expected) && isDeallocationLike(observed))
    return (
      valuesEqual(expected.adapter, observed.adapter) &&
      valuesEqual(expected.marketId, observed.marketId) &&
      expected.amount === observed.amount
    );
  return expected === observed;
};

const describe = (value: unknown): string => {
  if (typeof value === "bigint") return value.toString();
  if (isRiskMetric(value))
    return value.type === "finite" ? value.valueWad.toString() : value.type;
  if (Array.isArray(value)) return `[${value.map(describe).join(", ")}]`;
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
};

const unmatched = (
  limit: OperationLimit,
  context: SimulationErrorContext,
): never => {
  throw new ConsumerLimitViolationError(
    `No verified operation matches operation limit type "${limit.type}"${limit.transactionIndex === undefined ? "" : ` at transaction ${limit.transactionIndex}`}. Check the limit list against the bundle's decoded operations.`,
    context,
    {
      type: "operation",
      operationIndex: limit.transactionIndex ?? -1,
      limit: limit.type,
      expected: "a decoded operation of this type",
      observed: "none",
    },
  );
};

/**
 * Bind caller-declared operation limits to their verified operations and
 * check wallet debit/credit bounds plus every declared operation constraint.
 *
 * @internal
 * @param effects - Policy-verified effects carrying the effective limits.
 * @returns The branded {@link ConstrainedEffects} stage output.
 * @throws {ConsumerLimitViolationError} on any violated bound.
 */
export function enforceLimits(effects: VerifiedEffects): ConstrainedEffects {
  const { verification } = effects;
  const { limits } = verification;
  const context: SimulationErrorContext = {
    stage: "limits",
    chainId: verification.chainId,
    mode: verification.mode,
  };

  const owner = effects.evidence.plan.owner;
  const net = new Map<string, bigint>();
  for (const change of verification.diff.wallet) {
    if (change.account.toLowerCase() !== owner.toLowerCase()) continue;
    const key = change.token.toLowerCase();
    net.set(key, (net.get(key) ?? 0n) + change.assets);
  }

  for (const bound of limits.wallet.maxDebit) {
    const observed = -(net.get(bound.token.toLowerCase()) ?? 0n);
    if (observed > bound.amount)
      throw new ConsumerLimitViolationError(
        `Net debit "${observed}" of "${bound.token}" exceeds maxDebit bound "${bound.amount}". Increase the bound or reduce the withdrawn amount.`,
        context,
        {
          type: "wallet",
          field: "maxDebit",
          account: owner,
          token: bound.token,
          boundAssets: bound.amount,
          observedAssets: observed,
        },
      );
  }
  for (const bound of limits.wallet.minCredit) {
    const observed = net.get(bound.token.toLowerCase()) ?? 0n;
    if (observed < bound.amount)
      throw new ConsumerLimitViolationError(
        `Net credit "${observed}" of "${bound.token}" is below minCredit bound "${bound.amount}". Decrease the bound or verify the receiver credit.`,
        context,
        {
          type: "wallet",
          field: "minCredit",
          account: owner,
          token: bound.token,
          boundAssets: bound.amount,
          observedAssets: observed,
        },
      );
  }

  const boundLimits: BoundOperationLimit[] = [];
  const findVerified = <T extends OperationType>(
    type: T,
    transactionIndex: number | undefined,
  ): VerifiedOf<T> | undefined =>
    verification.operations.find(
      (o): o is VerifiedOf<T> =>
        o.operation.type === type &&
        (transactionIndex === undefined ||
          o.operation.transactionIndex === transactionIndex),
    );

  for (const limit of limits.operations) {
    switch (limit.type) {
      case "blueSupply": {
        const verified =
          findVerified("blueSupply", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "blueWithdraw": {
        const verified =
          findVerified("blueWithdraw", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "blueSupplyCollateral": {
        const verified =
          findVerified("blueSupplyCollateral", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "blueBorrow": {
        const verified =
          findVerified("blueBorrow", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "blueSupplyCollateralBorrow": {
        const verified =
          findVerified("blueSupplyCollateralBorrow", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "blueRepay": {
        const verified =
          findVerified("blueRepay", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "blueWithdrawCollateral": {
        const verified =
          findVerified("blueWithdrawCollateral", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "blueRepayWithdrawCollateral": {
        const verified =
          findVerified("blueRepayWithdrawCollateral", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "blueRefinance": {
        const verified =
          findVerified("blueRefinance", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "blueAuthorization": {
        const verified =
          findVerified("blueAuthorization", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "vaultV1Deposit": {
        const verified =
          findVerified("vaultV1Deposit", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "vaultV2Deposit": {
        const verified =
          findVerified("vaultV2Deposit", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "vaultV1Withdraw": {
        const verified =
          findVerified("vaultV1Withdraw", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "vaultV2Withdraw": {
        const verified =
          findVerified("vaultV2Withdraw", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "vaultV1Redeem": {
        const verified =
          findVerified("vaultV1Redeem", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "vaultV2Redeem": {
        const verified =
          findVerified("vaultV2Redeem", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "vaultV2ForceWithdraw": {
        const verified =
          findVerified("vaultV2ForceWithdraw", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "vaultV2ForceRedeem": {
        const verified =
          findVerified("vaultV2ForceRedeem", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "vaultV1InKindRedeem": {
        const verified =
          findVerified("vaultV1InKindRedeem", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "vaultV2InKindRedeem": {
        const verified =
          findVerified("vaultV2InKindRedeem", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      case "vaultV1MigrateToV2": {
        const verified =
          findVerified("vaultV1MigrateToV2", limit.transactionIndex) ??
          unmatched(limit, context);
        checkOperationLimit(
          verified.operation,
          verified.outcome,
          limit,
          context,
        );
        boundLimits.push({ operation: verified.operation, limit });
        break;
      }
      default: {
        const _exhaustive: never = limit;
        throw new UnexpectedSimulationError(
          `Unhandled operation limit type "${JSON.stringify(_exhaustive)}"`,
          context,
        );
      }
    }
  }

  return brandConstrained({ effects, boundLimits });
}

/**
 * Check every declared field of one bound operation limit against the
 * explicit {@link BINDINGS} table. `"equals"` bindings compare the decoded
 * operation field; `"min"`/`"max"` bindings bound a numeric outcome — a
 * non-finite {@link RiskMetric} (`debtFree`/`unbounded`) means "infinite",
 * failing every `"max"` cap and passing every `"min"` bound; `"minByMarket"`
 * requires each declared market leg to be covered by the observed credits.
 */
// biome-ignore lint/complexity/useMaxParams: each check needs operation, outcome, limit and context
function checkOperationLimit<T extends OperationType>(
  operation: OpOf<T>,
  outcome: OutcomeOf<T>,
  limit: OperationLimitFields[T] & {
    readonly type: T;
    readonly transactionIndex?: number;
  },
  context: SimulationErrorContext,
): void {
  const table = BINDINGS[limit.type];
  const operationIndex = operation.transactionIndex;

  // biome-ignore lint/complexity/useMaxParams: violation reports need field, bound, observed and hint
  const violation = (
    field: keyof OperationLimitFields[T],
    expected: unknown,
    observed: unknown,
    hint: string,
  ): ConsumerLimitViolationError =>
    new ConsumerLimitViolationError(
      `Operation limit "${limit.type}.${String(field)}" expected "${describe(expected)}", observed "${describe(observed)}". ${hint}`,
      context,
      {
        type: "operation",
        operationIndex,
        limit: `${limit.type}.${String(field)}`,
        expected: describe(expected),
        observed: describe(observed),
      } satisfies ConsumerConstraintContext,
    );

  const fields = keysOf(table) as (keyof OperationLimitFields[T])[];
  for (const field of fields) {
    const bound = limit[field];
    if (bound === undefined) continue;
    const binding = table[field];

    if (binding.kind === "equals") {
      const observed = binding.read(operation);
      if (observed === undefined || !valuesEqual(bound, observed))
        throw violation(
          field,
          bound,
          observed,
          "The bundle does not match the declared constraint.",
        );
      continue;
    }

    if (binding.kind === "minByMarket") {
      const observed = binding.read(outcome);
      if (!Array.isArray(bound)) continue;
      for (const minimum of bound) {
        if (!isSupplyMinimum(minimum)) continue;
        const leg = observed.find(
          (entry) =>
            entry.marketId.toLowerCase() === minimum.marketId.toLowerCase(),
        );
        if (leg == null || leg.assets < minimum.minAssets)
          throw violation(
            field,
            minimum.minAssets,
            leg?.assets,
            `Market "${minimum.marketId}" did not supply the declared minimum.`,
          );
      }
      continue;
    }

    if (typeof bound !== "bigint") {
      throw new UnexpectedSimulationError(
        `Bound for "${limit.type}.${String(field)}" is not numeric; min*/max* limits must declare bigint values`,
        context,
      );
    }
    const observed = binding.read(outcome);
    const numeric =
      typeof observed === "bigint"
        ? observed
        : observed.type === "finite"
          ? observed.valueWad
          : null;
    const pass =
      binding.kind === "max"
        ? numeric != null && numeric <= bound
        : numeric == null || numeric >= bound;
    if (!pass)
      throw violation(
        field,
        bound,
        observed,
        binding.kind === "min"
          ? "Decrease the bound or adjust the operation."
          : "Increase the bound or reduce the operation.",
      );
  }
}
