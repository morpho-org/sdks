import { deepFreeze, MathLib } from "@morpho-org/morpho-ts";
import {
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

/**
 * Compare observed amounts against the caller's quote and percentage tolerance.
 * Minimum outputs round up and maximum inputs round down, so rounding never
 * permits a deviation greater than the requested percentage.
 * When `limits.sharePrice` is set, also bound the realized assets-per-share
 * rate of the pair `limits.type` prices.
 * @param params - Message prefix naming the operation, parsed limits with their operation `type`, matching observations, optional post-bundle Blue position or Midnight credit for `position` bounds, and optional debt-share semantics.
 * @returns The checked quote and tolerance, plus the checked `sharePrice`/`position` bounds when set, deep-frozen.
 * @throws {ConsumerLimitViolationError} When adverse slippage exceeds tolerance, the realized rate is past the `sharePrice` bound, or no shares moved, or the post-bundle position violates a `position` bound.
 * @throws {SlippageCheckUnavailableError} When a quoted amount, either side of the `sharePrice` pair, or the post-bundle position for a `position` bound has no observation, or the operation prices no single conversion.
 * @internal
 */
export function checkSlippage(params: {
  readonly label: string;
  readonly limits: CheckedSlippageLimits & {
    readonly type: OperationType;
    readonly inputs?: OperationInputs[keyof OperationInputs];
  };
  readonly observed: SlippageQuote;
  /** Fields checked by a composed wallet bound instead of a scalar delta. */
  readonly skipFields?: readonly ScalarQuoteField[];
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
}): CheckedSlippageLimits {
  const {
    label,
    limits,
    observed,
    debtShares = false,
    skipFields = [],
  } = params;
  const slippageTolerance = limits.slippageTolerance;
  for (const field of params.inactiveFields ?? []) {
    const amount = observed[field];
    if (amount === undefined)
      throw new SlippageCheckUnavailableError(
        `${label}: missing observation for inactive "${field}".`,
      );
    const output = field === "collateralSupplied";
    if (output ? amount < 0n : amount > 0n)
      throw new ConsumerLimitViolationError(
        `${label}: inactive "${field}" must not move adversely, got "${amount}".`,
      );
  }
  const quote: { -readonly [K in keyof SlippageQuote]: SlippageQuote[K] } = {};
  const fieldChecks: {
    -readonly [K in keyof NonNullable<
      CheckedSlippageLimits["fieldChecks"]
    >]: NonNullable<CheckedSlippageLimits["fieldChecks"]>[K];
  } = {};
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
    if (expected === undefined) continue;
    if (field !== "penalty" && skipFields.includes(field)) {
      quote[field] = expected;
      continue;
    }
    const amount = observed[field];
    if (amount === undefined) {
      throw new SlippageCheckUnavailableError(
        `${label}: missing observation for "${field}". Supply the matching asset or position.`,
      );
    }
    const derived =
      field !== "penalty" && (params.derivedFields?.includes(field) ?? false);
    const exact =
      field !== "penalty" && (params.exactFields?.includes(field) ?? false);
    // Each preceding subject-market supply can lower the rounded-up conversion
    // by one share wei.
    if (
      derived &&
      field === "sharesBurned" &&
      params.subjectShareRoundingAllowance !== undefined &&
      amount + params.subjectShareRoundingAllowance < expected
    )
      throw new ConsumerLimitViolationError(
        `${label}: subject shares for "${field}" expected at least "${expected - (params.subjectShareRoundingAllowance ?? 0n)}", got "${amount}". Check the operation subject.`,
      );
    if (
      limits.inputs !== undefined &&
      expected > 0n &&
      amount === 0n &&
      (field === "sharesMinted" ||
        field === "sharesBurned" ||
        field === "collateralSupplied" ||
        field === "collateralWithdrawn") &&
      !params.inactiveFields?.includes(field)
    )
      throw new ConsumerLimitViolationError(
        `${label}: no position movement on the selected subject for "${field}"; expected "${expected}", got "${amount}". Check the operation subject.`,
      );
    if (derived && exact && amount !== expected)
      throw new ConsumerLimitViolationError(
        `${label}: exact input "${field}" expected "${expected}", got "${amount}". Adjust the transaction or inputs.`,
      );
    const tolerance = derived ? 0n : slippageTolerance;
    const bound = derived
      ? expected
      : output
        ? MathLib.wMulUp(expected, MathLib.WAD - tolerance)
        : MathLib.wMulDown(expected, MathLib.WAD + tolerance);
    if (
      limits.type === "midnightSupplyBlueMakeLend" &&
      field === "assetsPaid" &&
      amount !== expected
    ) {
      throw new ConsumerLimitViolationError(
        `${label}: wallet debit for "${field}" must equal quote "${expected}", got "${amount}". Adjust the transaction or quote.`,
      );
    }
    if (output ? amount < bound : amount > bound) {
      throw new ConsumerLimitViolationError(
        derived
          ? `${label}: derived ${output ? "minimum" : "maximum"} for "${field}" is "${expected}", got "${amount}". Check the transaction against the typed inputs, or quote "${field}" explicitly.`
          : `${label}: slippage for "${field}" exceeds tolerance "${tolerance}" against quote "${expected}"; allowed bound "${bound}", got "${amount}". Adjust the transaction or tolerance.`,
      );
    }
    quote[field] = expected;
    if (field !== "penalty")
      fieldChecks[field] = !derived
        ? "quoted"
        : params.exactFields?.includes(field)
          ? "exact"
          : output
            ? "minimum"
            : "maximum";
  }
  if (limits.quote.positions !== undefined) {
    const observedPositions = observed.positions ?? [];
    const checkedPositions: InKindPositionQuote[] = [];
    for (const expected of limits.quote.positions) {
      const amount = observedPositions.find(
        (position) =>
          position.marketId.toLowerCase() === expected.marketId.toLowerCase(),
      )?.supplyShares;
      if (amount === undefined) {
        throw new SlippageCheckUnavailableError(
          `${label}: missing observation for "positions" in market "${expected.marketId}". Supply the matching asset or position.`,
        );
      }
      const bound = MathLib.wMulUp(
        expected.supplyShares,
        MathLib.WAD - limits.slippageTolerance,
      );
      if (amount < bound) {
        throw new ConsumerLimitViolationError(
          `${label}: slippage for "positions" in market "${expected.marketId}" exceeds tolerance "${limits.slippageTolerance}" against quote "${expected.supplyShares}"; allowed bound "${bound}", got "${amount}". Adjust the transaction or tolerance.`,
        );
      }
      checkedPositions.push({
        marketId: expected.marketId,
        supplyShares: expected.supplyShares,
      });
    }
    quote.positions = checkedPositions;
  }
  if (limits.quote.collateralWithdrawals !== undefined) {
    if (observed.collateralWithdrawals === undefined)
      throw new SlippageCheckUnavailableError(
        `${label}: missing observation for "collateralWithdrawals".`,
      );
    quote.collateralWithdrawals = limits.quote.collateralWithdrawals.map(
      (entry) => ({ ...entry }),
    );
  }
  if (limits.quote.collateralSupplies !== undefined) {
    const observedSupplies = observed.collateralSupplies;
    if (observedSupplies === undefined)
      throw new SlippageCheckUnavailableError(
        `${label}: missing observation for "collateralSupplies".`,
      );
    quote.collateralSupplies = limits.quote.collateralSupplies.map(
      (expected) => {
        const amount = observedSupplies.find(
          (entry) => entry.collateralIndex === expected.collateralIndex,
        )?.assets;
        if (amount === undefined)
          throw new SlippageCheckUnavailableError(
            `${label}: missing observation for collateral index "${expected.collateralIndex}".`,
          );
        const minimum = expected.assets;
        if (amount < minimum)
          throw new ConsumerLimitViolationError(
            `${label}: collateral index "${expected.collateralIndex}" credit is below the exact quote "${expected.assets}"; got "${amount}".`,
          );
        return { ...expected };
      },
    );
  }
  if (limits.quote.deallocations !== undefined) {
    const observedDeallocations = observed.deallocations;
    if (observedDeallocations === undefined) {
      throw new SlippageCheckUnavailableError(
        `${label}: missing observation for "deallocations". Supply the force-exit call logs.`,
      );
    }
    const quoted = new Set(
      limits.quote.deallocations.map((entry) => entry.marketId.toLowerCase()),
    );
    for (const realized of observedDeallocations) {
      if (!quoted.has(realized.marketId.toLowerCase())) {
        throw new ConsumerLimitViolationError(
          `${label}: slippage for "deallocations" exceeds tolerance "${limits.slippageTolerance}"; deallocated "${realized.assets}" assets in unquoted market "${realized.marketId}". Adjust the transaction or tolerance.`,
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
        throw new ConsumerLimitViolationError(
          `${label}: slippage for "deallocations" in market "${expected.marketId}" exceeds tolerance "${limits.slippageTolerance}" against quote "${expected.assets}"; allowed bound "${bound}", got "${amount}". Adjust the transaction or tolerance.`,
        );
      }
      checkedDeallocations.push({
        marketId: expected.marketId,
        assets: expected.assets,
      });
    }
    quote.deallocations = checkedDeallocations;
  }
  let sharePrice: SharePriceLimit | undefined;
  if (limits.sharePrice !== undefined) {
    const pair = sharePriceMeasurement(limits.type);
    const assets = pair === undefined ? undefined : observed[pair.assets];
    const shares = pair === undefined ? undefined : observed[pair.shares];
    if (pair === undefined || assets === undefined || shares === undefined) {
      throw new SlippageCheckUnavailableError(
        `${label}: missing observation for "sharePrice". Supply the matching asset or position.`,
      );
    }
    if (shares === 0n) {
      throw new ConsumerLimitViolationError(
        `${label}: slippage for "sharePrice" exceeds tolerance "${limits.sharePrice.tolerance}" against quote "${limits.sharePrice.expected}"; no shares moved, got "${assets}" assets. Adjust the transaction or tolerance.`,
      );
    }
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
      throw new ConsumerLimitViolationError(
        `${label}: slippage for "sharePrice" exceeds tolerance "${limits.sharePrice.tolerance}" against quote "${limits.sharePrice.expected}"; allowed bound "${bound}", got "${realized}". Adjust the transaction or tolerance.`,
      );
    }
    sharePrice = {
      expected: limits.sharePrice.expected,
      tolerance: limits.sharePrice.tolerance,
    };
  }
  let positionBounds:
    | BluePositionBounds
    | MidnightPositionBounds
    | MidnightDebtPositionBounds
    | undefined;
  const maxCredit = limits.position?.maxCredit;
  if (
    (limits.type === "midnightRepayWithdrawCollateral" ||
      limits.type === "midnightTakeRepayWithdrawCollateral") &&
    limits.position !== undefined
  ) {
    const bounds = limits.position;
    if (bounds.maxDebt !== undefined) {
      const amount = params.midnightDebt;
      if (amount === undefined)
        throw new SlippageCheckUnavailableError(
          `${label}: missing post-bundle debt observation for "position.maxDebt".`,
        );
      if (amount > bounds.maxDebt)
        throw new ConsumerLimitViolationError(
          `${label}: post-bundle position.maxDebt "${amount}" is above the maximum "${bounds.maxDebt}". Adjust the transaction or the bound.`,
        );
    }
    for (const expected of bounds.maxCollateral ?? []) {
      const amount = params.midnightCollateral?.get(expected.collateralIndex);
      if (amount === undefined)
        throw new SlippageCheckUnavailableError(
          `${label}: missing post-bundle collateral observation for index "${expected.collateralIndex}".`,
        );
      if (amount > expected.assets)
        throw new ConsumerLimitViolationError(
          `${label}: post-bundle position.maxCollateral for index "${expected.collateralIndex}" is "${amount}", above the maximum "${expected.assets}". Adjust the transaction or the bound.`,
        );
    }
    positionBounds = {
      ...(bounds.maxDebt === undefined ? {} : { maxDebt: bounds.maxDebt }),
      ...(bounds.maxCollateral === undefined
        ? {}
        : {
            maxCollateral: bounds.maxCollateral.map((entry) => ({ ...entry })),
          }),
    };
  } else if (maxCredit !== undefined) {
    if (params.credit === undefined) {
      throw new SlippageCheckUnavailableError(
        `${label}: missing post-bundle credit observation for "position"; the credit read failed or was not planned. Retry the simulation or report the RPC response.`,
      );
    }
    if (params.credit > maxCredit) {
      throw new ConsumerLimitViolationError(
        `${label}: post-bundle position.maxCredit "${params.credit}" is above the maximum "${maxCredit}". Adjust the transaction or the bound.`,
      );
    }
    positionBounds = { maxCredit };
  } else if (limits.position !== undefined) {
    const bounds = limits.position;
    const after = params.position;
    if (after === undefined) {
      throw new SlippageCheckUnavailableError(
        `${label}: missing post-bundle position observation for "position"; the position read failed or was not planned. Retry the simulation or report the RPC response.`,
      );
    }
    for (const [field, bound, amount, minimum] of [
      ["maxBorrowShares", bounds.maxBorrowShares, after.borrowShares, false],
      ["minSupplyShares", bounds.minSupplyShares, after.supplyShares, true],
      ["minCollateral", bounds.minCollateral, after.collateral, true],
    ] as const) {
      if (bound === undefined) continue;
      if (minimum ? amount < bound : amount > bound) {
        throw new ConsumerLimitViolationError(
          `${label}: post-bundle position.${field} "${amount}" is ${minimum ? "below the minimum" : "above the maximum"} "${bound}". Adjust the transaction or the bound.`,
        );
      }
    }
    positionBounds = {
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
  return deepFreeze({
    quote,
    slippageTolerance: limits.slippageTolerance,
    ...(params.derivedFields === undefined ? {} : { fieldChecks }),
    ...(sharePrice === undefined ? {} : { sharePrice }),
    ...(positionBounds === undefined ? {} : { position: positionBounds }),
  });
}
