import { type MarketInput, MarketUtils } from "@morpho-org/midnight-sdk";
import type {
  MidnightCollateralAmount,
  MidnightCollateralSupplyInput,
  MidnightCollateralWithdrawalInput,
} from "../actions/midnight/types.js";
import {
  DuplicateMidnightCollateralIndexError,
  EmptyMidnightCollateralAmountsError,
  NegativeInputError,
  NonPositiveInputError,
} from "../types/index.js";

const validateCollateralAmounts = ({
  market,
  field,
  amounts,
}: {
  readonly market: MarketInput;
  readonly field: string;
  readonly amounts: readonly MidnightCollateralAmount[];
}): readonly MidnightCollateralAmount[] => {
  const seen = new Set<bigint>();
  for (const [index, { collateralIndex, assets }] of amounts.entries()) {
    if (collateralIndex < 0n) {
      throw new NegativeInputError(
        `${field}[${index}].collateralIndex`,
        collateralIndex,
      );
    }
    if (assets <= 0n) {
      throw new NonPositiveInputError(`${field}[${index}].assets`, assets);
    }
    if (seen.has(collateralIndex)) {
      throw new DuplicateMidnightCollateralIndexError(field, collateralIndex);
    }
    seen.add(collateralIndex);
    // Validate that the index is configured on the market.
    MarketUtils.getCollateralByIndex(market, collateralIndex);
  }

  return amounts.map(({ collateralIndex, assets }) => ({
    collateralIndex,
    assets,
  }));
};

/**
 * Normalizes and validates the collateral supplied by a Midnight flow.
 *
 * The single form maps to one entry at `collateralIndex ?? 0n`. Entries keep
 * caller order; duplicate indices and empty lists are rejected.
 *
 * @internal
 */
export const resolveMidnightCollateralSupplies = (
  market: MarketInput,
  input: MidnightCollateralSupplyInput,
): readonly MidnightCollateralAmount[] => {
  if (input.collateralSupplies == null) {
    if (input.collateralAssets <= 0n) {
      throw new NonPositiveInputError(
        "collateralAssets",
        input.collateralAssets,
      );
    }
    return validateCollateralAmounts({
      market,
      field: "collateralSupplies",
      amounts: [
        {
          collateralIndex: input.collateralIndex ?? 0n,
          assets: input.collateralAssets,
        },
      ],
    });
  }
  if (input.collateralSupplies.length === 0) {
    throw new EmptyMidnightCollateralAmountsError("collateralSupplies");
  }

  return validateCollateralAmounts({
    market,
    field: "collateralSupplies",
    amounts: input.collateralSupplies,
  });
};

/**
 * Normalizes and validates the collateral withdrawn by a Midnight flow.
 *
 * The single form maps to no entry when `withdrawCollateralAssets` is `0n`
 * and to one entry at `collateralIndex ?? 0n` otherwise. Entries keep caller
 * order; duplicate indices are rejected and an empty list withdraws nothing.
 *
 * @internal
 */
export const resolveMidnightCollateralWithdrawals = (
  market: MarketInput,
  input: MidnightCollateralWithdrawalInput,
): readonly MidnightCollateralAmount[] => {
  if (input.collateralWithdrawals == null) {
    if (input.withdrawCollateralAssets < 0n) {
      throw new NegativeInputError(
        "withdrawCollateralAssets",
        input.withdrawCollateralAssets,
      );
    }
    if (input.withdrawCollateralAssets === 0n) return [];
    return validateCollateralAmounts({
      market,
      field: "collateralWithdrawals",
      amounts: [
        {
          collateralIndex: input.collateralIndex ?? 0n,
          assets: input.withdrawCollateralAssets,
        },
      ],
    });
  }

  return validateCollateralAmounts({
    market,
    field: "collateralWithdrawals",
    amounts: input.collateralWithdrawals,
  });
};
