import { deepFreeze, MathLib } from "@morpho-org/morpho-ts";
import {
  ConsumerLimitViolationError,
  SlippageCheckUnavailableError,
} from "../errors.js";
import type {
  BluePositionBounds,
  ForceExitDeallocationQuote,
  InKindPositionQuote,
  OperationType,
  SharePriceLimit,
  SlippageLimits,
  SlippageQuote,
} from "../limits.js";
import { sharePriceMeasurement } from "./measurement-plan.js";

/**
 * Compare observed amounts against the caller's quote and percentage tolerance.
 * Minimum outputs round up and maximum inputs round down, so rounding never
 * permits a deviation greater than the requested percentage.
 * When `limits.sharePrice` is set, also bound the realized assets-per-share
 * rate of the pair `limits.type` prices.
 * @param params - Message prefix naming the operation, parsed limits with their operation `type`, matching observations, optional post-bundle position for `position` bounds, and optional debt-share semantics.
 * @returns The checked quote and tolerance, plus the checked `sharePrice`/`position` bounds when set, deep-frozen.
 * @throws {ConsumerLimitViolationError} When adverse slippage exceeds tolerance, the realized rate is past the `sharePrice` bound, or no shares moved, or the post-bundle position violates a `position` bound.
 * @throws {SlippageCheckUnavailableError} When a quoted amount, either side of the `sharePrice` pair, or the post-bundle position for a `position` bound has no observation, or the operation prices no single conversion.
 * @internal
 */
export function checkSlippage(params: {
  readonly label: string;
  readonly limits: SlippageLimits & { readonly type: OperationType };
  readonly observed: SlippageQuote;
  readonly debtShares?: boolean;
  /** The subject's Blue position after the bundle, for `position` bounds. */
  readonly position?: {
    readonly supplyShares: bigint;
    readonly borrowShares: bigint;
    readonly collateral: bigint;
  };
}): SlippageLimits {
  const { label, limits, observed, debtShares = false } = params;
  const quote: { -readonly [K in keyof SlippageQuote]: SlippageQuote[K] } = {};
  for (const [field, output] of [
    ["assetsReceived", true],
    ["sharesMinted", !debtShares],
    ["assetsPaid", false],
    ["sharesBurned", debtShares],
    ["penalty", false],
  ] as const) {
    const expected = limits.quote[field];
    if (expected === undefined) continue;
    const amount = observed[field];
    if (amount === undefined) {
      throw new SlippageCheckUnavailableError(
        `${label}: missing observation for "${field}". Supply the matching asset or position.`,
      );
    }
    const bound = output
      ? MathLib.wMulUp(expected, MathLib.WAD - limits.slippageTolerance)
      : MathLib.wMulDown(expected, MathLib.WAD + limits.slippageTolerance);
    if (output ? amount < bound : amount > bound) {
      throw new ConsumerLimitViolationError(
        `${label}: slippage for "${field}" exceeds tolerance "${limits.slippageTolerance}" against quote "${expected}"; allowed bound "${bound}", got "${amount}". Adjust the transaction or tolerance.`,
      );
    }
    quote[field] = expected;
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
  let positionBounds: BluePositionBounds | undefined;
  if (limits.position !== undefined) {
    const after = params.position;
    if (after === undefined) {
      throw new SlippageCheckUnavailableError(
        `${label}: missing post-bundle position observation for "position"; the position read failed or was not planned. Retry the simulation or report the RPC response.`,
      );
    }
    for (const [field, bound, amount, minimum] of [
      [
        "maxBorrowShares",
        limits.position.maxBorrowShares,
        after.borrowShares,
        false,
      ],
      [
        "minSupplyShares",
        limits.position.minSupplyShares,
        after.supplyShares,
        true,
      ],
      ["minCollateral", limits.position.minCollateral, after.collateral, true],
    ] as const) {
      if (bound === undefined) continue;
      if (minimum ? amount < bound : amount > bound) {
        throw new ConsumerLimitViolationError(
          `${label}: post-bundle position.${field} "${amount}" is ${minimum ? "below the minimum" : "above the maximum"} "${bound}". Adjust the transaction or the bound.`,
        );
      }
    }
    positionBounds = {
      ...(limits.position.maxBorrowShares === undefined
        ? {}
        : { maxBorrowShares: limits.position.maxBorrowShares }),
      ...(limits.position.minSupplyShares === undefined
        ? {}
        : { minSupplyShares: limits.position.minSupplyShares }),
      ...(limits.position.minCollateral === undefined
        ? {}
        : { minCollateral: limits.position.minCollateral }),
    };
  }
  return deepFreeze({
    quote,
    slippageTolerance: limits.slippageTolerance,
    ...(sharePrice === undefined ? {} : { sharePrice }),
    ...(positionBounds === undefined ? {} : { position: positionBounds }),
  });
}
