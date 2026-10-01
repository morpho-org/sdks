import type { MarketId } from "@morpho-org/blue-sdk";
import type { DecodedOperation } from "../../decode/operation.js";
import {
  ConsumerLimitViolationError,
  UnexpectedSimulationError,
} from "../../errors.js";
import type { MarketMinAssets, OperationLimit } from "../../limits.js";
import type {
  Fee,
  SimulatedOperation,
  SimulationStateChange,
} from "../../result.js";
import type { Transfer as TxTransfer } from "../../types.js";
import type { ParsedState, RiskMetric } from "../state/types.js";
import { checkBlueOperation } from "./blue.js";
import {
  type CheckContext,
  type CheckedOperation,
  checkContext,
  operationSubject,
} from "./helpers.js";
import { checkVaultOperation } from "./vault.js";

type OperationType = OperationLimit["type"];

type OpOf<T extends OperationType> = Extract<
  DecodedOperation,
  { readonly type: T }
>;
type OutcomeOf<T extends OperationType> = Extract<
  CheckedOperation,
  { readonly operation: { readonly type: T } }
>["outcome"];

type LimitOf<T extends OperationType> = OperationLimit extends infer U
  ? U extends OperationLimit
    ? T extends U["type"]
      ? U
      : never
    : never
  : never;

type LimitFields<T extends OperationType> = Omit<
  LimitOf<T>,
  "type" | "transactionIndex"
>;

/**
 * How one operation-limit field is checked: `"equals"` compares a decoded
 * operation field; `"min"`/`"max"` bound a numeric or {@link RiskMetric}
 * outcome; `"minByMarket"` requires each declared `{marketId, minAssets}` leg
 * covered by observed per-market credits.
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

/** Explicit per-type constraint table; an unknown key is a compile error. */
const BINDINGS: {
  [T in OperationType]: {
    readonly [F in keyof LimitFields<T>]-?: FieldBinding<
      T,
      NonNullable<LimitFields<T>[F]>
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
    expectedBorrowAssets: { kind: "equals", read: (op) => op.borrowAssets },
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
    minRefundAssets: { kind: "min", read: (outcome) => outcome.refundAssets },
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
    minRefundAssets: { kind: "min", read: (outcome) => outcome.refundAssets },
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
    expectedAssets: { kind: "equals", read: (op) => op.funding.assets },
    expectedReceiver: { kind: "equals", read: (op) => op.receiver },
    minSharesMinted: {
      kind: "min",
      read: (outcome) => outcome.sharesMinted,
    },
  },
  vaultV2Deposit: {
    vault: { kind: "equals", read: (op) => op.vault },
    expectedAssets: { kind: "equals", read: (op) => op.funding.assets },
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
    expectedAssets: { kind: "equals", read: (op) => op.amount.assets },
    expectedShares: { kind: "equals", read: (op) => op.amount.shares },
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

const isSupplyMinimum = (value: unknown): value is MarketMinAssets =>
  typeof value === "object" &&
  value !== null &&
  "marketId" in value &&
  "minAssets" in value;

/** Element-wise equality: hex strings case-insensitive, bigint/boolean `===`, arrays recurse, deallocation records on adapter/marketId/amount. */
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

const scalar = (
  key: "expected" | "observed",
  value: unknown,
):
  | { readonly expected: bigint | boolean | `0x${string}` }
  | { readonly observed: bigint | boolean | `0x${string}` }
  | { readonly expected?: never; readonly observed?: never } => {
  if (typeof value !== "bigint" && typeof value !== "boolean") {
    if (typeof value !== "string" || !value.startsWith("0x")) return {};
    const hex = value as `0x${string}`;
    return key === "expected" ? { expected: hex } : { observed: hex };
  }
  return key === "expected" ? { expected: value } : { observed: value };
};

/**
 * Check every declared field of one bound operation limit against the
 * {@link BINDINGS} table. `"equals"` bindings compare the decoded operation
 * field; `"min"`/`"max"` bindings bound a numeric outcome — a non-finite
 * {@link RiskMetric} means "infinite", failing every `"max"` cap and passing
 * every `"min"` bound; `"minByMarket"` requires each declared market leg
 * covered.
 */
// biome-ignore lint/complexity/useMaxParams: each check needs operation, outcome, limit and context
function checkOperationLimit<T extends OperationType>(
  operation: OpOf<T>,
  outcome: OutcomeOf<T>,
  limit: LimitOf<T>,
  type: T,
  ctx: CheckContext,
): void {
  const table = BINDINGS[type];

  // biome-ignore lint/complexity/useMaxParams: violation reports need field, bound, observed and hint
  const violation = (
    field: keyof LimitFields<T>,
    expected: unknown,
    observed: unknown,
    hint: string,
  ): ConsumerLimitViolationError =>
    new ConsumerLimitViolationError(
      `Operation limit "${type}.${String(field)}" expected "${describe(expected)}", observed "${describe(observed)}". ${hint}`,
      {
        context: {
          stage: "verification",
          chainId: ctx.chainId,
          mode: ctx.mode,
          blockNumber: ctx.block.blockNumber,
          ...operationSubject(operation),
          field: `${type}.${String(field)}`,
          ...scalar("expected", expected),
          ...scalar("observed", observed),
          failedTransactionIndex: operation.transactionIndex,
        },
      },
    );

  const { type: _type, transactionIndex: _index, ...declared } = limit;
  const fields = keysOf(table) as (keyof LimitFields<T>)[];
  for (const field of fields) {
    const bound: unknown = Reflect.get(declared, field);
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
        `Bound for "${type}.${String(field)}" is not numeric; min*/max* limits must declare bigint values`,
        { context: checkContext(ctx, `${type}.${String(field)}`) },
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

const unmatched = (ctx: CheckContext, limit: OperationLimit): never => {
  throw new ConsumerLimitViolationError(
    `No verified operation matches operation limit type "${limit.type}"${limit.transactionIndex === undefined ? "" : ` at transaction ${limit.transactionIndex}`}. Check the limit list against the bundle's decoded operations.`,
    {
      context: checkContext(ctx, limit.type, {
        failedTransactionIndex: limit.transactionIndex,
      }),
    },
  );
};

/** Public per-operation record: transaction index plus subject entity keys. @internal */
export const toSimulatedOperation = (
  checked: CheckedOperation,
): SimulatedOperation => ({
  transactionIndex: checked.operation.transactionIndex,
  ...operationSubject(checked.operation),
});

/**
 * Run the per-operation economic checks plus every declared consumer limit
 * (`limits.operations`), inlined on the checked outcome.
 *
 * @returns The checked operations plus the collected conversion/fee records.
 * @throws {UnsupportedOperationError} on a type with no check.
 * @internal
 */
export function checkOperations(params: {
  readonly ctx: CheckContext;
  readonly operations: readonly DecodedOperation[];
  readonly accruedBefore: ParsedState;
  readonly after: ParsedState;
  readonly diff: SimulationStateChange;
  readonly actionDiff: SimulationStateChange;
  readonly transfers: readonly TxTransfer[];
}): {
  readonly operations: readonly CheckedOperation[];
  readonly fees: readonly Fee[];
  readonly touchedMarketIds: ReadonlySet<MarketId>;
} {
  const { ctx, operations, accruedBefore, after, actionDiff } = params;

  const checked: CheckedOperation[] = [];
  const fees: Fee[] = [];
  const touchedMarketIds = new Set<MarketId>();

  for (const operation of operations) {
    switch (operation.type) {
      case "blueSupply":
      case "blueWithdraw":
      case "blueSupplyCollateral":
      case "blueBorrow":
      case "blueSupplyCollateralBorrow":
      case "blueRepay":
      case "blueWithdrawCollateral":
      case "blueRepayWithdrawCollateral":
      case "blueAuthorization": {
        if ("market" in operation)
          touchedMarketIds.add(operation.market.marketId);
        checked.push(checkBlueOperation(ctx, operation, accruedBefore, after));
        break;
      }
      case "blueRefinance": {
        touchedMarketIds.add(operation.sourceMarket.marketId);
        touchedMarketIds.add(operation.targetMarket.marketId);
        checked.push(checkBlueOperation(ctx, operation, accruedBefore, after));
        break;
      }
      case "vaultV1Deposit":
      case "vaultV2Deposit":
      case "vaultV1Withdraw":
      case "vaultV2Withdraw":
      case "vaultV1Redeem":
      case "vaultV2Redeem":
      case "vaultV1MigrateToV2":
      case "vaultV2ForceWithdraw":
      case "vaultV2ForceRedeem":
      case "vaultV1InKindRedeem":
      case "vaultV2InKindRedeem": {
        if (
          operation.type === "vaultV1InKindRedeem" ||
          operation.type === "vaultV2InKindRedeem"
        )
          for (const leg of operation.markets)
            touchedMarketIds.add(leg.marketId);
        if (operation.type === "vaultV2ForceRedeem")
          for (const leg of operation.deallocations)
            if (leg.marketId != null) touchedMarketIds.add(leg.marketId);
        const { checked: verified, fee } = checkVaultOperation(
          ctx,
          operation,
          accruedBefore,
          after,
          actionDiff,
        );
        checked.push(verified);
        if (fee != null) fees.push(fee);
        break;
      }
      default: {
        const _exhaustive: never = operation;
        throw new UnexpectedSimulationError(
          `Operation type has no verification contract: ${JSON.stringify(_exhaustive)}`,
          { context: checkContext(ctx, "operation") },
        );
      }
    }
  }

  // Consumer limits are inlined here, bound to the checked outcomes.
  const findChecked = <T extends OperationType>(
    type: T,
    transactionIndex: number | undefined,
  ): Extract<CheckedOperation, { operation: { type: T } }> | undefined =>
    checked.find(
      (o): o is Extract<CheckedOperation, { operation: { type: T } }> =>
        o.operation.type === type &&
        (transactionIndex === undefined ||
          o.operation.transactionIndex === transactionIndex),
    );

  for (const limit of ctx.limits.operations) {
    switch (limit.type) {
      case "blueSupply": {
        const v =
          findChecked("blueSupply", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(v.operation, v.outcome, limit, "blueSupply", ctx);
        break;
      }
      case "blueWithdraw": {
        const v =
          findChecked("blueWithdraw", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(v.operation, v.outcome, limit, "blueWithdraw", ctx);
        break;
      }
      case "blueSupplyCollateral": {
        const v =
          findChecked("blueSupplyCollateral", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "blueSupplyCollateral",
          ctx,
        );
        break;
      }
      case "blueBorrow": {
        const v =
          findChecked("blueBorrow", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(v.operation, v.outcome, limit, "blueBorrow", ctx);
        break;
      }
      case "blueSupplyCollateralBorrow": {
        const v =
          findChecked("blueSupplyCollateralBorrow", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "blueSupplyCollateralBorrow",
          ctx,
        );
        break;
      }
      case "blueRepay": {
        const v =
          findChecked("blueRepay", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(v.operation, v.outcome, limit, "blueRepay", ctx);
        break;
      }
      case "blueWithdrawCollateral": {
        const v =
          findChecked("blueWithdrawCollateral", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "blueWithdrawCollateral",
          ctx,
        );
        break;
      }
      case "blueRepayWithdrawCollateral": {
        const v =
          findChecked("blueRepayWithdrawCollateral", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "blueRepayWithdrawCollateral",
          ctx,
        );
        break;
      }
      case "blueRefinance": {
        const v =
          findChecked("blueRefinance", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "blueRefinance",
          ctx,
        );
        break;
      }
      case "blueAuthorization": {
        const v =
          findChecked("blueAuthorization", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "blueAuthorization",
          ctx,
        );
        break;
      }
      case "vaultV1Deposit": {
        const v =
          findChecked("vaultV1Deposit", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "vaultV1Deposit",
          ctx,
        );
        break;
      }
      case "vaultV2Deposit": {
        const v =
          findChecked("vaultV2Deposit", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "vaultV2Deposit",
          ctx,
        );
        break;
      }
      case "vaultV1Withdraw": {
        const v =
          findChecked("vaultV1Withdraw", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "vaultV1Withdraw",
          ctx,
        );
        break;
      }
      case "vaultV2Withdraw": {
        const v =
          findChecked("vaultV2Withdraw", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "vaultV2Withdraw",
          ctx,
        );
        break;
      }
      case "vaultV1Redeem": {
        const v =
          findChecked("vaultV1Redeem", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "vaultV1Redeem",
          ctx,
        );
        break;
      }
      case "vaultV2Redeem": {
        const v =
          findChecked("vaultV2Redeem", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "vaultV2Redeem",
          ctx,
        );
        break;
      }
      case "vaultV2ForceWithdraw": {
        const v =
          findChecked("vaultV2ForceWithdraw", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "vaultV2ForceWithdraw",
          ctx,
        );
        break;
      }
      case "vaultV2ForceRedeem": {
        const v =
          findChecked("vaultV2ForceRedeem", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "vaultV2ForceRedeem",
          ctx,
        );
        break;
      }
      case "vaultV1InKindRedeem": {
        const v =
          findChecked("vaultV1InKindRedeem", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "vaultV1InKindRedeem",
          ctx,
        );
        break;
      }
      case "vaultV2InKindRedeem": {
        const v =
          findChecked("vaultV2InKindRedeem", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "vaultV2InKindRedeem",
          ctx,
        );
        break;
      }
      case "vaultV1MigrateToV2": {
        const v =
          findChecked("vaultV1MigrateToV2", limit.transactionIndex) ??
          unmatched(ctx, limit);
        checkOperationLimit(
          v.operation,
          v.outcome,
          limit,
          "vaultV1MigrateToV2",
          ctx,
        );
        break;
      }
      default: {
        const _exhaustive: never = limit;
        throw new UnexpectedSimulationError(
          `Unhandled operation limit type "${JSON.stringify(_exhaustive)}"`,
          { context: checkContext(ctx, "operationLimit") },
        );
      }
    }
  }

  return { operations: checked, fees, touchedMarketIds };
}
