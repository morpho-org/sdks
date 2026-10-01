import type { MarketId } from "@morpho-org/blue-sdk";
import type { DecodedOperation } from "../../decode/operation.js";
import {
  ConsumerLimitViolationError,
  SimulationValidationError,
} from "../../errors.js";
import type { MarketMinAssets } from "../../limits.js";
import {
  type At,
  type CheckFields,
  verificationContext,
} from "../internal/error-context.js";
import type { RiskMetric } from "../internal/evidence.js";
import type { OperationLimitFields } from "../internal/limits.js";
import type { VerifiedOperation } from "../internal/result.js";
import {
  type BoundOperationLimit,
  brandConstrained,
  type ConstrainedEffects,
  type VerifiedEffects,
} from "../internal/stages.js";
import { bindOperationLimits } from "./bind-operation-limits.js";

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
    maxAfterBorrowApyWad: {
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
    maxAfterBorrowApyWad: {
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
    expectedRecipient: { kind: "equals", read: (op) => op.receiver },
    expectedOnBehalf: { kind: "equals", read: (op) => op.onBehalf },
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

const isRiskMetric = (value: unknown): value is RiskMetric =>
  typeof value === "object" && value !== null && "type" in value;

const isDeallocationLike = (
  value: unknown,
): value is { adapter: unknown; marketId?: unknown; assets: unknown } =>
  typeof value === "object" &&
  value !== null &&
  "adapter" in value &&
  "assets" in value;

/** Keep only scalar bound values the check context accepts. @internal */
const scalar = (key: "expected" | "observed", value: unknown): CheckFields =>
  typeof value === "bigint" ||
  typeof value === "boolean" ||
  (typeof value === "string" && value.startsWith("0x"))
    ? { [key]: value as bigint | boolean | `0x${string}` }
    : {};

const isSupplyMinimum = (value: unknown): value is MarketMinAssets =>
  typeof value === "object" &&
  value !== null &&
  "marketId" in value &&
  "minAssets" in value;

/**
 * Element-wise equality without `JSON.stringify`: hex strings compare
 * case-insensitively (covers `Address` and `MarketId`), bigint/boolean/number
 * compare by `===`, arrays recurse element-wise, and deallocation-like
 * records compare on `adapter`/`marketId`/`assets` only.
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
      expected.assets === observed.assets
    );
  return expected === observed;
};

const describe = (value: unknown): string => {
  if (typeof value === "bigint") return value.toString();
  if (isRiskMetric(value))
    return value.type === "finite" ? value.valueWad.toString() : value.type;
  if (Array.isArray(value)) return `[${value.map(describe).join(", ")}]`;
  if (typeof value === "object" && value !== null)
    return JSON.stringify(value, (_key, entry: unknown) =>
      typeof entry === "bigint" ? entry.toString() : entry,
    );
  return String(value);
};

/** Binding table with the per-type accessor signatures erased for a bound pair. */
type ErasedBinding =
  | { readonly kind: "equals"; read(op: DecodedOperation): unknown }
  | {
      readonly kind: "min" | "max";
      read(outcome: VerifiedOperation["outcome"]): bigint | RiskMetric;
    }
  | {
      readonly kind: "minByMarket";
      read(
        outcome: VerifiedOperation["outcome"],
      ): readonly { readonly marketId: MarketId; readonly assets: bigint }[];
    };

/**
 * {@link BINDINGS} viewed through method-style (bivariant) signatures. A
 * {@link BoundOperationLimit} already correlates operation and limit types, so
 * each accessor is only ever called with the operation kind it was written for.
 */
const LOOKUP: {
  readonly [T in OperationType]: {
    readonly [F in keyof OperationLimitFields[T]]-?: ErasedBinding;
  };
} = BINDINGS;

/**
 * Enforce consumer limits on verified effects. Order is fixed:
 * {@link bindOperationLimits} first (rejecting unknown, inapplicable,
 * ambiguous, duplicate and widening limits before any comparison), then each
 * bound operation limit in operation order (transaction index, call path).
 * The first violated bound throws.
 *
 * @internal
 * @param effects - Policy-verified effects carrying the effective limits.
 * @returns The branded {@link ConstrainedEffects} stage output.
 * @throws {SimulationValidationError} When a limit cannot be bound.
 * @throws {ConsumerLimitViolationError} On the first violated bound.
 */
export function enforceLimits(effects: VerifiedEffects): ConstrainedEffects {
  const { verification } = effects;
  const { limits } = verification;
  const at: At = {
    context: effects.evidence.context,
    mode: verification.mode,
  };

  const outcomes = new Map(
    verification.operations.map((o) => [o.operation, o.outcome] as const),
  );
  const boundLimits = bindOperationLimits([...outcomes.keys()], limits);
  // Every key of `outcomes` was passed to the binder, so the lookup is total.
  for (const bound of boundLimits)
    checkOperationLimit(bound, outcomes.get(bound.operation)!, at);

  return brandConstrained({ effects, boundLimits });
}

/**
 * Check every declared field of one bound operation limit against the
 * explicit {@link BINDINGS} table, in table order. `"equals"` bindings compare
 * the decoded operation field; `"min"`/`"max"` bindings bound a numeric
 * outcome inclusively — a `finite` {@link RiskMetric} compares numerically,
 * `debtFree` (LTV 0, infinite health factor) satisfies every cap and floor,
 * and `unbounded` (zero collateral or liquidity) fails every `"max"` cap and
 * passes every `"min"` bound; `"minByMarket"` requires each declared market
 * leg to be covered by an observed credit. A missing observation never passes.
 */
// biome-ignore lint/complexity/useMaxParams: each check needs the bound pair, outcome and context
function checkOperationLimit(
  bound: BoundOperationLimit,
  outcome: VerifiedOperation["outcome"],
  at: At,
): void {
  const { operation, limit } = bound;
  const table: { readonly [field: string]: ErasedBinding } = LOOKUP[limit.type];
  const declared: { readonly [field: string]: unknown } = { ...limit };

  // biome-ignore lint/complexity/useMaxParams: diagnostic builder reads clearest with positional arguments
  const violation = (
    field: string,
    expected: unknown,
    observed: unknown,
    hint: string,
  ): ConsumerLimitViolationError =>
    new ConsumerLimitViolationError(
      `Operation limit "${limit.type}.${field}" expected "${describe(expected)}", observed "${describe(observed)}". ${hint}`,
      {
        context: verificationContext(at.context, at.mode, {
          field: `${limit.type}.${field}`,
          ...scalar("expected", expected),
          ...scalar("observed", observed),
          failedTransactionIndex: operation.transactionIndex,
        }),
      },
    );

  for (const [field, binding] of Object.entries(table)) {
    const declaredBound = declared[field];
    if (declaredBound === undefined) continue;

    if (binding.kind === "equals") {
      const observed = binding.read(operation);
      if (observed === undefined || !valuesEqual(declaredBound, observed))
        throw violation(
          field,
          declaredBound,
          observed,
          "The bundle does not match the declared constraint.",
        );
      continue;
    }

    if (binding.kind === "minByMarket") {
      if (
        !Array.isArray(declaredBound) ||
        !declaredBound.every(isSupplyMinimum)
      )
        throw new SimulationValidationError(
          `limits.operations: "${limit.type}.${field}" must be a list of { marketId, minAssets }`,
          undefined,
          verificationContext(at.context, at.mode, {
            field: `${limit.type}.${field}`,
          }),
        );
      const observed = binding.read(outcome);
      for (const minimum of declaredBound) {
        const leg = observed.find(
          (entry) =>
            entry.marketId.toLowerCase() === minimum.marketId.toLowerCase(),
        );
        if (leg === undefined || leg.assets < minimum.minAssets)
          throw violation(
            field,
            minimum.minAssets,
            leg?.assets,
            `Market "${minimum.marketId}" did not supply the declared minimum.`,
          );
      }
      continue;
    }

    if (typeof declaredBound !== "bigint")
      throw new SimulationValidationError(
        `limits.operations: "${limit.type}.${field}" must be a bigint`,
        undefined,
        verificationContext(at.context, at.mode, {
          field: `${limit.type}.${field}`,
        }),
      );
    const observed = binding.read(outcome);
    const compare = (value: bigint) =>
      binding.kind === "max" ? value <= declaredBound : value >= declaredBound;
    // debtFree: LTV is 0 and health factor is infinite, so any cap or floor
    // holds. unbounded (zero collateral/liquidity): fails caps, passes floors.
    const pass =
      typeof observed === "bigint"
        ? compare(observed)
        : observed.type === "finite"
          ? compare(observed.valueWad)
          : observed.type === "debtFree" || binding.kind === "min";
    if (!pass)
      throw violation(
        field,
        declaredBound,
        observed,
        binding.kind === "min"
          ? "Decrease the bound or adjust the operation."
          : "Increase the bound or reduce the operation.",
      );
  }
}
