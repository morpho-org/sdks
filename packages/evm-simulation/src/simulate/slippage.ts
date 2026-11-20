import { deepFreeze, MathLib } from "@morpho-org/morpho-ts";
import {
  type ConsumerLimitViolation,
  ConsumerLimitViolationError,
  SlippageCheckUnavailableError,
} from "../errors.js";
import {
  type BluePositionBounds,
  type CheckedSlippageLimits,
  type ForceExitDeallocationQuote,
  type InKindPositionQuote,
  type MidnightDebtPositionBounds,
  type MidnightPositionBounds,
  type OperationInputs,
  type OperationType,
  QUOTE_FIELD_DIRECTION,
  type ScalarQuoteField,
  type SharePriceLimit,
  type SlippageQuote,
} from "../limits.js";
import { sharePriceMeasurement } from "./measurement-plan.js";

type SlippageParams = Parameters<typeof findSlippageFailures>[0];
type SlippageFailure =
  | ConsumerLimitViolationError
  | SlippageCheckUnavailableError;
type FieldChecks = {
  -readonly [K in keyof NonNullable<
    CheckedSlippageLimits["fieldChecks"]
  >]: NonNullable<CheckedSlippageLimits["fieldChecks"]>[K];
};

/** One `findSlippageFailures` call: its inputs, plus the failures and checked quote it accumulates in check order. */
interface SlippageCheck {
  readonly params: SlippageParams;
  readonly failures: SlippageFailure[];
  readonly quote: { -readonly [K in keyof SlippageQuote]: SlippageQuote[K] };
  readonly violation: (
    message: string,
    facts: Omit<ConsumerLimitViolation, "operationIndex" | "operationType">,
  ) => ConsumerLimitViolationError;
}

/** Inactive legs must not move adversely. */
function checkInactiveFields(check: SlippageCheck): void {
  const { params, failures, violation } = check;
  const { label, limits, observed } = params;
  for (const field of params.inactiveFields ?? []) {
    const amount = observed[field];
    if (amount === undefined) {
      if (!params.unavailableFields?.includes(field)) {
        failures.push(
          new SlippageCheckUnavailableError(
            `${label}: missing observation for inactive "${field}".`,
            {
              operationIndex: params.operationIndex,
              operationType: limits.type,
              field: field,
              reason: "missingRead",
            },
          ),
        );
      }
      continue;
    }
    const output = field === "collateralSupplied";
    if (output ? amount < 0n : amount > 0n) {
      failures.push(
        violation(
          `${label}: inactive "${field}" must not move adversely, got "${amount}".`,
          { field, check: "inactiveLeg", expected: 0n, observed: amount },
        ),
      );
    }
  }
}

/** Check one observed scalar field against its quoted or derived expectation. */
function checkScalarAmount(
  check: SlippageCheck,
  {
    field,
    output,
    expected,
    amount,
    derived,
    exact,
  }: {
    readonly field: ScalarQuoteField | "penalty";
    readonly output: boolean;
    readonly expected: bigint;
    readonly amount: bigint;
    readonly derived: boolean;
    readonly exact: boolean;
  },
): void {
  const { params, failures, violation } = check;
  const { label, limits } = params;
  const slippageTolerance = limits.slippageTolerance;
  // Each preceding subject-market supply can lower the rounded-up conversion
  // by one share wei.
  if (
    derived &&
    field === "sharesBurned" &&
    params.subjectShareRoundingAllowance !== undefined &&
    amount + params.subjectShareRoundingAllowance < expected
  ) {
    failures.push(
      violation(
        `${label}: subject shares for "${field}" expected at least "${expected - (params.subjectShareRoundingAllowance ?? 0n)}", got "${amount}". Check the operation subject.`,
        {
          field,
          check: "derivedBound",
          expected,
          observed: amount,
          bound: expected - params.subjectShareRoundingAllowance,
        },
      ),
    );
  }
  if (
    limits.inputs !== undefined &&
    expected > 0n &&
    amount === 0n &&
    (field === "sharesMinted" ||
      field === "sharesBurned" ||
      field === "collateralSupplied" ||
      field === "collateralWithdrawn") &&
    !params.inactiveFields?.includes(field)
  ) {
    failures.push(
      violation(
        `${label}: no position movement on the selected subject for "${field}"; expected "${expected}", got "${amount}". Check the operation subject.`,
        { field, check: "noMovement", expected, observed: amount },
      ),
    );
  }
  if (derived && exact && amount !== expected) {
    failures.push(
      violation(
        `${label}: exact input "${field}" expected "${expected}", got "${amount}". Adjust the transaction or inputs.`,
        { field, check: "exactQuote", expected, observed: amount },
      ),
    );
  }
  const tolerance = derived ? 0n : slippageTolerance;
  let bound = expected;
  if (!derived) {
    bound = output
      ? MathLib.wMulUp(expected, MathLib.WAD - tolerance)
      : MathLib.wMulDown(expected, MathLib.WAD + tolerance);
  }
  if (
    limits.type === "midnightSupplyBlueMakeLend" &&
    field === "assetsPaid" &&
    amount !== expected
  ) {
    failures.push(
      violation(
        `${label}: wallet debit for "${field}" must equal quote "${expected}", got "${amount}". Adjust the transaction or quote.`,
        { field, check: "exactQuote", expected, observed: amount },
      ),
    );
  }
  if (output ? amount < bound : amount > bound) {
    failures.push(
      violation(
        derived
          ? `${label}: derived ${output ? "minimum" : "maximum"} for "${field}" is "${expected}", got "${amount}". Check the transaction against the typed inputs, or quote "${field}" explicitly.`
          : `${label}: slippage for "${field}" exceeds tolerance "${tolerance}" against quote "${expected}"; allowed bound "${bound}", got "${amount}". Adjust the transaction or tolerance.`,
        derived
          ? {
              field,
              check: "derivedBound",
              expected,
              observed: amount,
              bound,
            }
          : {
              field,
              check: "slippageTolerance",
              expected,
              observed: amount,
              tolerance,
              bound,
            },
      ),
    );
  }
}

/** Check every scalar quote field in direction-table order. */
function checkScalarFields(
  check: SlippageCheck,
  fieldChecks: FieldChecks,
): void {
  const { params, failures, quote } = check;
  const { label, limits, observed } = params;
  const { debtShares = false, skipFields = [] } = params;
  for (const [field, spec] of [
    ...(Object.entries(QUOTE_FIELD_DIRECTION) as [
      ScalarQuoteField,
      { readonly output: boolean },
    ][]),
    ["penalty", { output: false } as const],
  ] as const) {
    // Debt shares flip the direction: minted debt is a cap, burned debt a minimum.
    const output =
      (field === "sharesMinted" || field === "sharesBurned") && debtShares
        ? !spec.output
        : spec.output;
    const expected = limits.quote[field];
    if (expected === undefined) {
      continue;
    }
    if (field !== "penalty" && skipFields.includes(field)) {
      quote[field] = expected;
      continue;
    }
    const amount = observed[field];
    if (amount === undefined) {
      if (!params.unavailableFields?.includes(field)) {
        failures.push(
          new SlippageCheckUnavailableError(
            `${label}: missing observation for "${field}". Supply the matching asset or position.`,
            {
              operationIndex: params.operationIndex,
              operationType: limits.type,
              field: field,
              reason: "missingRead",
            },
          ),
        );
      }
      continue;
    }
    const derived =
      field !== "penalty" && (params.derivedFields?.includes(field) ?? false);
    const exact =
      field !== "penalty" && (params.exactFields?.includes(field) ?? false);
    // Record the amount and any failure in the shared result.
    checkScalarAmount(check, {
      field,
      output,
      expected,
      amount,
      derived,
      exact,
    });
    quote[field] = expected;
    if (field !== "penalty") {
      if (derived) {
        fieldChecks[field] = output ? "minimum" : "maximum";
        if (params.exactFields?.includes(field)) {
          fieldChecks[field] = "exact";
        }
      } else {
        fieldChecks[field] = "quoted";
      }
    }
  }
}

/** Check in-kind redemption positions against their quoted supply shares. */
function checkInKindPositions(check: SlippageCheck): void {
  const { params, failures, quote, violation } = check;
  const { label, limits, observed } = params;
  if (limits.quote.positions !== undefined) {
    const observedPositions = observed.positions ?? [];
    const checkedPositions: InKindPositionQuote[] = [];
    for (const expected of limits.quote.positions) {
      const amount = observedPositions.find(
        (position) =>
          position.marketId.toLowerCase() === expected.marketId.toLowerCase(),
      )?.supplyShares;
      if (amount === undefined) {
        if (!params.unavailableFields?.includes("positions")) {
          failures.push(
            new SlippageCheckUnavailableError(
              `${label}: missing observation for "positions" in market "${expected.marketId}". Supply the matching asset or position.`,
              {
                operationIndex: params.operationIndex,
                operationType: limits.type,
                field: "positions",
                reason: "missingRead",
              },
            ),
          );
        }
        continue;
      }
      const bound = MathLib.wMulUp(
        expected.supplyShares,
        MathLib.WAD - limits.slippageTolerance,
      );
      if (amount < bound) {
        failures.push(
          violation(
            `${label}: slippage for "positions" in market "${expected.marketId}" exceeds tolerance "${limits.slippageTolerance}" against quote "${expected.supplyShares}"; allowed bound "${bound}", got "${amount}". Adjust the transaction or tolerance.`,
            {
              field: "positions",
              check: "slippageTolerance",
              expected: expected.supplyShares,
              observed: amount,
              tolerance: limits.slippageTolerance,
              bound,
              entry: { marketId: expected.marketId },
            },
          ),
        );
      }
      checkedPositions.push({
        marketId: expected.marketId,
        supplyShares: expected.supplyShares,
      });
    }
    quote.positions = checkedPositions;
  }
}

/** Record quoted collateral withdrawals, checked by their wallet bounds. */
function checkCollateralWithdrawals(check: SlippageCheck): void {
  const { params, failures, quote } = check;
  const { label, limits, observed } = params;
  if (limits.quote.collateralWithdrawals !== undefined) {
    if (
      observed.collateralWithdrawals === undefined &&
      !params.unavailableFields?.includes("collateralWithdrawals")
    ) {
      failures.push(
        new SlippageCheckUnavailableError(
          `${label}: missing observation for "collateralWithdrawals".`,
          {
            operationIndex: params.operationIndex,
            operationType: limits.type,
            field: "collateralWithdrawals",
            reason: "missingRead",
          },
        ),
      );
    }
    quote.collateralWithdrawals = limits.quote.collateralWithdrawals.map(
      (entry) => ({ ...entry }),
    );
  }
}

/** Check per-index collateral credit against exact supplies. */
function checkCollateralSupplies(check: SlippageCheck): void {
  const { params, failures, quote, violation } = check;
  const { label, limits, observed } = params;
  if (limits.quote.collateralSupplies !== undefined) {
    const observedSupplies = observed.collateralSupplies;
    if (observedSupplies === undefined) {
      if (!params.unavailableFields?.includes("collateralSupplies")) {
        failures.push(
          new SlippageCheckUnavailableError(
            `${label}: missing observation for "collateralSupplies".`,
            {
              operationIndex: params.operationIndex,
              operationType: limits.type,
              field: "collateralSupplies",
              reason: "missingRead",
            },
          ),
        );
      }
    } else {
      quote.collateralSupplies = limits.quote.collateralSupplies.map(
        (expected) => {
          const amount = observedSupplies.find(
            (entry) => entry.collateralIndex === expected.collateralIndex,
          )?.assets;
          if (amount === undefined) {
            if (!params.unavailableFields?.includes("collateralSupplies")) {
              failures.push(
                new SlippageCheckUnavailableError(
                  `${label}: missing observation for collateral index "${expected.collateralIndex}".`,
                  {
                    operationIndex: params.operationIndex,
                    operationType: limits.type,
                    field: "collateralSupplies",
                    reason: "missingRead",
                  },
                ),
              );
            }
            return { ...expected };
          }
          const minimum = expected.assets;
          if (amount < minimum) {
            failures.push(
              violation(
                `${label}: collateral index "${expected.collateralIndex}" credit is below the exact quote "${expected.assets}"; got "${amount}".`,
                {
                  field: "collateralSupplies",
                  check: "exactQuote",
                  expected: expected.assets,
                  observed: amount,
                  bound: minimum,
                  entry: { collateralIndex: expected.collateralIndex },
                },
              ),
            );
          }
          return { ...expected };
        },
      );
    }
  }
}

/** Check force-exit deallocations against their quoted markets. */
function checkDeallocations(check: SlippageCheck): void {
  const { params, failures, quote, violation } = check;
  const { label, limits, observed } = params;
  if (limits.quote.deallocations !== undefined) {
    const observedDeallocations = observed.deallocations;
    if (observedDeallocations === undefined) {
      if (!params.unavailableFields?.includes("deallocations")) {
        failures.push(
          new SlippageCheckUnavailableError(
            `${label}: missing observation for "deallocations". Supply the force-exit call logs.`,
            {
              operationIndex: params.operationIndex,
              operationType: limits.type,
              field: "deallocations",
              reason: "missingRead",
            },
          ),
        );
      }
    } else {
      const quoted = new Set(
        limits.quote.deallocations.map((entry) => entry.marketId.toLowerCase()),
      );
      for (const realized of observedDeallocations) {
        if (!quoted.has(realized.marketId.toLowerCase())) {
          failures.push(
            violation(
              `${label}: slippage for "deallocations" exceeds tolerance "${limits.slippageTolerance}"; deallocated "${realized.assets}" assets in unquoted market "${realized.marketId}". Adjust the transaction or tolerance.`,
              {
                field: "deallocations",
                check: "unquotedMarket",
                expected: 0n,
                observed: realized.assets,
                tolerance: limits.slippageTolerance,
                entry: { marketId: realized.marketId },
              },
            ),
          );
        }
      }
      const checkedDeallocations: ForceExitDeallocationQuote[] = [];
      for (const expected of limits.quote.deallocations) {
        // More than quoted is adverse: an unobserved market deallocated nothing.
        const amount =
          observedDeallocations.find(
            (entry) =>
              entry.marketId.toLowerCase() === expected.marketId.toLowerCase(),
          )?.assets ?? 0n;
        const bound = MathLib.wMulDown(
          expected.assets,
          MathLib.WAD + limits.slippageTolerance,
        );
        if (amount > bound) {
          failures.push(
            violation(
              `${label}: slippage for "deallocations" in market "${expected.marketId}" exceeds tolerance "${limits.slippageTolerance}" against quote "${expected.assets}"; allowed bound "${bound}", got "${amount}". Adjust the transaction or tolerance.`,
              {
                field: "deallocations",
                check: "slippageTolerance",
                expected: expected.assets,
                observed: amount,
                tolerance: limits.slippageTolerance,
                bound,
                entry: { marketId: expected.marketId },
              },
            ),
          );
        }
        checkedDeallocations.push({
          marketId: expected.marketId,
          assets: expected.assets,
        });
      }
      quote.deallocations = checkedDeallocations;
    }
  }
}

/** Check the realized assets-per-share rate against its bound. */
function checkSharePrice(check: SlippageCheck): SharePriceLimit | undefined {
  const { params, failures, violation } = check;
  const { label, limits, observed } = params;
  if (limits.sharePrice === undefined) {
    return undefined;
  }
  const pair = sharePriceMeasurement(limits.type);
  const assets = pair === undefined ? undefined : observed[pair.assets];
  const shares = pair === undefined ? undefined : observed[pair.shares];
  if (pair === undefined || assets === undefined || shares === undefined) {
    if (
      pair === undefined ||
      !params.unavailableFields?.some(
        (field) => field === pair.assets || field === pair.shares,
      )
    ) {
      failures.push(
        new SlippageCheckUnavailableError(
          `${label}: missing observation for "sharePrice". Supply the matching asset or position.`,
          {
            operationIndex: params.operationIndex,
            operationType: limits.type,
            field: "sharePrice",
            reason: "missingRead",
          },
        ),
      );
    }
  } else if (shares === 0n) {
    failures.push(
      violation(
        `${label}: slippage for "sharePrice" exceeds tolerance "${limits.sharePrice.tolerance}" against quote "${limits.sharePrice.expected}"; no shares moved, got "${assets}" assets. Adjust the transaction or tolerance.`,
        {
          field: "sharePrice",
          check: "noMovement",
          expected: limits.sharePrice.expected,
          observed: 0n,
          tolerance: limits.sharePrice.tolerance,
        },
      ),
    );
  } else {
    const realized = pair.higherIsAdverse
      ? MathLib.mulDivUp(assets, MathLib.RAY, shares)
      : MathLib.mulDivDown(assets, MathLib.RAY, shares);
    const bound = pair.higherIsAdverse
      ? MathLib.wMulDown(
          limits.sharePrice.expected,
          MathLib.WAD + limits.sharePrice.tolerance,
        )
      : MathLib.wMulUp(
          limits.sharePrice.expected,
          MathLib.WAD - limits.sharePrice.tolerance,
        );
    if (pair.higherIsAdverse ? realized > bound : realized < bound) {
      failures.push(
        violation(
          `${label}: slippage for "sharePrice" exceeds tolerance "${limits.sharePrice.tolerance}" against quote "${limits.sharePrice.expected}"; allowed bound "${bound}", got "${realized}". Adjust the transaction or tolerance.`,
          {
            field: "sharePrice",
            check: "slippageTolerance",
            expected: limits.sharePrice.expected,
            observed: realized,
            tolerance: limits.sharePrice.tolerance,
            bound,
          },
        ),
      );
    }
  }
  return {
    expected: limits.sharePrice.expected,
    tolerance: limits.sharePrice.tolerance,
  };
}

/** Check post-bundle Midnight debt and collateral against direct-repayment bounds. */
function checkMidnightDebtBounds(
  check: SlippageCheck,
  bounds: NonNullable<SlippageParams["limits"]["position"]>,
): MidnightDebtPositionBounds {
  const { params, failures, violation } = check;
  const { label, limits } = params;
  if (bounds.maxDebt !== undefined) {
    const amount = params.midnightDebt;
    if (amount === undefined) {
      if (!params.unavailableBounds?.includes("position.maxDebt")) {
        failures.push(
          new SlippageCheckUnavailableError(
            `${label}: missing post-bundle debt observation for "position.maxDebt".`,
            {
              operationIndex: params.operationIndex,
              operationType: limits.type,
              field: "position.maxDebt",
              reason: "missingRead",
            },
          ),
        );
      }
    } else if (amount > bounds.maxDebt) {
      failures.push(
        violation(
          `${label}: post-bundle position.maxDebt "${amount}" is above the maximum "${bounds.maxDebt}". Adjust the transaction or the bound.`,
          {
            field: "position.maxDebt",
            check: "positionBound",
            expected: bounds.maxDebt,
            observed: amount,
            bound: bounds.maxDebt,
          },
        ),
      );
    }
  }
  for (const expected of bounds.maxCollateral ?? []) {
    const amount = params.midnightCollateral?.get(expected.collateralIndex);
    if (amount === undefined) {
      if (
        !params.unavailableCollateralIndices?.includes(expected.collateralIndex)
      ) {
        failures.push(
          new SlippageCheckUnavailableError(
            `${label}: missing post-bundle collateral observation for index "${expected.collateralIndex}".`,
            {
              operationIndex: params.operationIndex,
              operationType: limits.type,
              field: "position.maxCollateral",
              reason: "missingRead",
            },
          ),
        );
      }
    } else if (amount > expected.assets) {
      failures.push(
        violation(
          `${label}: post-bundle position.maxCollateral for index "${expected.collateralIndex}" is "${amount}", above the maximum "${expected.assets}". Adjust the transaction or the bound.`,
          {
            field: "position.maxCollateral",
            check: "positionBound",
            expected: expected.assets,
            observed: amount,
            bound: expected.assets,
            entry: { collateralIndex: expected.collateralIndex },
          },
        ),
      );
    }
  }
  return {
    ...(bounds.maxDebt === undefined ? {} : { maxDebt: bounds.maxDebt }),
    ...(bounds.maxCollateral === undefined
      ? {}
      : {
          maxCollateral: bounds.maxCollateral.map((entry) => ({ ...entry })),
        }),
  };
}

/** Check post-bundle Midnight credit against its maximum. */
function checkMidnightCreditBound(
  check: SlippageCheck,
  maxCredit: bigint,
): MidnightPositionBounds {
  const { params, failures, violation } = check;
  const { label, limits } = params;
  if (params.credit === undefined) {
    if (!params.unavailableBounds?.includes("position.maxCredit")) {
      failures.push(
        new SlippageCheckUnavailableError(
          `${label}: missing post-bundle credit observation for "position"; the credit read failed or was not planned. Retry the simulation or report the RPC response.`,
          {
            operationIndex: params.operationIndex,
            operationType: limits.type,
            field: "position.maxCredit",
            reason: "missingRead",
          },
        ),
      );
    }
  } else if (params.credit > maxCredit) {
    failures.push(
      violation(
        `${label}: post-bundle position.maxCredit "${params.credit}" is above the maximum "${maxCredit}". Adjust the transaction or the bound.`,
        {
          field: "position.maxCredit",
          check: "positionBound",
          expected: maxCredit,
          observed: params.credit,
          bound: maxCredit,
        },
      ),
    );
  }
  return { maxCredit };
}

/** Check the post-bundle Blue position against its bounds. */
function checkBluePositionBounds(
  check: SlippageCheck,
  bounds: NonNullable<SlippageParams["limits"]["position"]>,
): BluePositionBounds {
  const { params, failures, violation } = check;
  const { label, limits } = params;
  const after = params.position;
  if (after === undefined) {
    if (!params.unavailableBounds?.includes("position")) {
      failures.push(
        new SlippageCheckUnavailableError(
          `${label}: missing post-bundle position observation for "position"; the position read failed or was not planned. Retry the simulation or report the RPC response.`,
          {
            operationIndex: params.operationIndex,
            operationType: limits.type,
            field: "position",
            reason: "missingRead",
          },
        ),
      );
    }
  } else {
    for (const [field, bound, amount, minimum] of [
      ["maxBorrowShares", bounds.maxBorrowShares, after.borrowShares, false],
      ["minSupplyShares", bounds.minSupplyShares, after.supplyShares, true],
      ["minCollateral", bounds.minCollateral, after.collateral, true],
    ] as const) {
      if (bound === undefined) {
        continue;
      }
      if (minimum ? amount < bound : amount > bound) {
        failures.push(
          violation(
            `${label}: post-bundle position.${field} "${amount}" is ${minimum ? "below the minimum" : "above the maximum"} "${bound}". Adjust the transaction or the bound.`,
            {
              field: `position.${field}`,
              check: "positionBound",
              expected: bound,
              observed: amount,
              bound,
            },
          ),
        );
      }
    }
  }
  return {
    ...(bounds.maxBorrowShares === undefined
      ? {}
      : { maxBorrowShares: bounds.maxBorrowShares }),
    ...(bounds.minSupplyShares === undefined
      ? {}
      : { minSupplyShares: bounds.minSupplyShares }),
    ...(bounds.minCollateral === undefined
      ? {}
      : { minCollateral: bounds.minCollateral }),
  };
}

/** Check the post-bundle position bounds that apply to the operation. */
function checkPositionBounds(
  check: SlippageCheck,
):
  | BluePositionBounds
  | MidnightPositionBounds
  | MidnightDebtPositionBounds
  | undefined {
  const { limits } = check.params;
  const maxCredit = limits.position?.maxCredit;
  if (
    (limits.type === "midnightRepayWithdrawCollateral" ||
      limits.type === "midnightTakeRepayWithdrawCollateral") &&
    limits.position !== undefined
  ) {
    return checkMidnightDebtBounds(check, limits.position);
  }
  if (maxCredit !== undefined) {
    return checkMidnightCreditBound(check, maxCredit);
  }
  if (limits.position !== undefined) {
    return checkBluePositionBounds(check, limits.position);
  }
  return undefined;
}

/**
 * Find failures against the caller's quote and percentage tolerance in check order.
 * Minimum outputs round up and maximum inputs round down, so rounding never
 * permits a deviation greater than the requested percentage.
 * When `limits.sharePrice` is set, also bound the realized assets-per-share
 * rate of the pair `limits.type` prices.
 * @param params - Message prefix and zero-based index naming the operation, parsed limits with their operation `type`, matching observations, optional post-bundle Blue position or Midnight credit for `position` bounds, and optional debt-share semantics.
 * @returns Failures in check order and the deep-frozen checked limits for the success path.
 * @internal
 */
export function findSlippageFailures(params: {
  readonly label: string;
  readonly operationIndex: number;
  readonly limits: CheckedSlippageLimits & {
    readonly type: OperationType;
    readonly inputs?: OperationInputs[keyof OperationInputs];
  };
  readonly observed: SlippageQuote;
  /** Fields checked by a composed wallet bound instead of a scalar delta. */
  readonly skipFields?: readonly ScalarQuoteField[];
  /** Fields whose missing observations were already reported during measurement. */
  readonly unavailableFields?: readonly (keyof SlippageQuote)[];
  readonly debtShares?: boolean;
  readonly derivedFields?: readonly ScalarQuoteField[];
  readonly exactFields?: readonly ScalarQuoteField[];
  readonly inactiveFields?: readonly ScalarQuoteField[];
  /** Number of earlier subject-market supplies evidenced in the bundle. */
  readonly subjectShareRoundingAllowance?: bigint;
  /** The subject's Blue position after the bundle, for `position` bounds. */
  readonly position?: {
    readonly supplyShares: bigint;
    readonly borrowShares: bigint;
    readonly collateral: bigint;
  };
  /** The subject's accrued Midnight credit after the bundle, for `midnightRedeem` `position` bounds. */
  readonly credit?: bigint;
  /** The subject's debt after the bundle for direct-repayment bounds. */
  readonly midnightDebt?: bigint;
  /** Final collateral balances by index for direct-repayment bounds. */
  readonly midnightCollateral?: ReadonlyMap<bigint, bigint>;
  /** Collateral indices whose final observation was already reported missing. */
  readonly unavailableCollateralIndices?: readonly bigint[];
  /** Bounds whose required final read was already reported missing. */
  readonly unavailableBounds?: readonly (
    | "position"
    | "position.maxDebt"
    | "position.maxCredit"
  )[];
}): {
  readonly failures: readonly (
    | ConsumerLimitViolationError
    | SlippageCheckUnavailableError
  )[];
  readonly checked: CheckedSlippageLimits;
} {
  const failures: SlippageFailure[] = [];
  const { limits } = params;
  const check: SlippageCheck = {
    params,
    failures,
    quote: {},
    violation: (message, facts) =>
      new ConsumerLimitViolationError(message, {
        operationIndex: params.operationIndex,
        operationType: limits.type,
        ...facts,
      }),
  };
  // Record any nonzero amount on an inactive quote side.
  checkInactiveFields(check);
  const fieldChecks: FieldChecks = {};
  // These checks fill the quote and collect failures in report order.
  checkScalarFields(check, fieldChecks);
  checkInKindPositions(check);
  checkCollateralWithdrawals(check);
  checkCollateralSupplies(check);
  checkDeallocations(check);
  const sharePrice = checkSharePrice(check);
  const positionBounds = checkPositionBounds(check);
  const { quote } = check;
  return {
    failures,
    checked: deepFreeze({
      quote,
      slippageTolerance: limits.slippageTolerance,
      ...(params.derivedFields === undefined ? {} : { fieldChecks }),
      ...(sharePrice === undefined ? {} : { sharePrice }),
      ...(positionBounds === undefined ? {} : { position: positionBounds }),
    }),
  };
}

/**
 * Reject the first slippage failure.
 * @param params - Observations and limits to check.
 * @returns The checked values for the success path.
 * @throws {ConsumerLimitViolationError} When a quoted limit is violated.
 * @throws {SlippageCheckUnavailableError} When required evidence is unavailable.
 * @internal
 */
export function checkSlippage(
  params: Parameters<typeof findSlippageFailures>[0],
): CheckedSlippageLimits {
  const {
    failures: [failure],
    checked,
  } = findSlippageFailures(params);
  if (failure !== undefined) {
    throw failure;
  }
  return checked;
}
