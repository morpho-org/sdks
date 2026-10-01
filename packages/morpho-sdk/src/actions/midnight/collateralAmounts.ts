import { type MarketInput, MarketUtils } from "@morpho-org/midnight-sdk";
import {
  ConflictingMidnightCollateralInputError,
  DuplicateMidnightCollateralIndexError,
  EmptyMidnightCollateralAmountsError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import type { MidnightCollateralAmount } from "./types.js";

interface CollateralSupplyInput {
  readonly collateralAssets?: bigint;
  readonly collateralIndex?: bigint;
  readonly collateralSupplies?: readonly MidnightCollateralAmount[];
}

interface CollateralWithdrawalInput {
  readonly withdrawCollateralAssets?: bigint;
  readonly collateralIndex?: bigint;
  readonly collateralWithdrawals?: readonly MidnightCollateralAmount[];
}

const assertSingleForm = ({
  listField,
  scalarField,
  scalarAssets,
  collateralIndex,
}: {
  readonly listField: string;
  readonly scalarField: string;
  readonly scalarAssets: bigint | undefined;
  readonly collateralIndex: bigint | undefined;
}) => {
  if (scalarAssets !== undefined) {
    throw new ConflictingMidnightCollateralInputError(listField, scalarField);
  }
  if (collateralIndex !== undefined) {
    throw new ConflictingMidnightCollateralInputError(
      listField,
      "collateralIndex",
    );
  }
};

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
 * caller order and map one-to-one to the input; duplicate indices, empty
 * lists and inputs mixing both forms are rejected.
 *
 * @internal
 */
export const resolveMidnightCollateralSupplies = (
  market: MarketInput,
  input: CollateralSupplyInput,
): readonly MidnightCollateralAmount[] => {
  if (input.collateralSupplies == null) {
    const collateralAssets = input.collateralAssets ?? 0n;
    if (collateralAssets <= 0n) {
      throw new NonPositiveInputError("collateralAssets", collateralAssets);
    }
    return validateCollateralAmounts({
      market,
      field: "collateralSupplies",
      amounts: [
        {
          collateralIndex: input.collateralIndex ?? 0n,
          assets: collateralAssets,
        },
      ],
    });
  }
  assertSingleForm({
    listField: "collateralSupplies",
    scalarField: "collateralAssets",
    scalarAssets: input.collateralAssets,
    collateralIndex: input.collateralIndex,
  });
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
 * order; duplicate indices and inputs mixing both forms are rejected, and an
 * empty list withdraws nothing.
 *
 * @internal
 */
export const resolveMidnightCollateralWithdrawals = (
  market: MarketInput,
  input: CollateralWithdrawalInput,
): readonly MidnightCollateralAmount[] => {
  if (input.collateralWithdrawals == null) {
    const withdrawCollateralAssets = input.withdrawCollateralAssets ?? 0n;
    const collateralIndex = input.collateralIndex ?? 0n;
    if (withdrawCollateralAssets < 0n) {
      throw new NegativeInputError(
        "withdrawCollateralAssets",
        withdrawCollateralAssets,
      );
    }
    if (collateralIndex < 0n) {
      throw new NegativeInputError("collateralIndex", collateralIndex);
    }
    if (withdrawCollateralAssets === 0n) return [];
    return validateCollateralAmounts({
      market,
      field: "collateralWithdrawals",
      amounts: [{ collateralIndex, assets: withdrawCollateralAssets }],
    });
  }
  assertSingleForm({
    listField: "collateralWithdrawals",
    scalarField: "withdrawCollateralAssets",
    scalarAssets: input.withdrawCollateralAssets,
    collateralIndex: input.collateralIndex,
  });
  for (const [
    index,
    { collateralIndex },
  ] of input.collateralWithdrawals.entries()) {
    if (collateralIndex < 0n) {
      throw new NegativeInputError(
        `collateralWithdrawals[${index}].collateralIndex`,
        collateralIndex,
      );
    }
  }

  return validateCollateralAmounts({
    market,
    field: "collateralWithdrawals",
    amounts: input.collateralWithdrawals,
  });
};
