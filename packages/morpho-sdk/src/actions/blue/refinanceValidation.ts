import {
  type AccrualPosition,
  type MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { isAddressEqual } from "viem";
import { validatePositionHealth } from "../../helpers/validate.js";
import {
  NonPositiveInputError,
  RefinanceSameMarketError,
  RefinanceTokenMismatchError,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import {
  getBlueBundlesV1PenaltyAssets,
  getBlueBundlesV1PublicAllocations,
  getBlueBundlesV1ReferralFeeAssets,
} from "./common.js";

/** @internal Rejects an empty source debt or incompatible refinance markets. */
export function validateBlueRefinanceSource({
  sourceMarketParams,
  destinationMarketParams,
  borrowShares,
}: {
  readonly sourceMarketParams: MarketParams;
  readonly destinationMarketParams: MarketParams;
  readonly borrowShares: bigint;
}): void {
  if (borrowShares <= 0n) {
    throw new NonPositiveInputError("positionData.borrowShares", borrowShares);
  }
  // Reject same-market migrations and token mismatches before quoting.
  validateBlueRefinanceMarkets(sourceMarketParams, destinationMarketParams);
}

/** @internal Requires distinct markets with identical loan and collateral tokens. */
export function validateBlueRefinanceMarkets(
  sourceMarketParams: MarketParams,
  destinationMarketParams: MarketParams,
): void {
  if (sourceMarketParams.id === destinationMarketParams.id) {
    throw new RefinanceSameMarketError(sourceMarketParams.id);
  }
  if (
    !isAddressEqual(
      sourceMarketParams.loanToken,
      destinationMarketParams.loanToken,
    ) ||
    !isAddressEqual(
      sourceMarketParams.collateralToken,
      destinationMarketParams.collateralToken,
    )
  ) {
    throw new RefinanceTokenMismatchError(
      sourceMarketParams.id,
      destinationMarketParams.id,
    );
  }
}

/** @internal Checks the migration quote, including destination debt from allocator penalties and fees. */
export function validateBlueRefinanceQuote({
  destinationMarketParams,
  sourcePosition,
  destinationPosition,
  reallocations,
  referralFeePct,
  now,
}: {
  readonly destinationMarketParams: MarketParams;
  readonly sourcePosition: Readonly<AccrualPosition>;
  readonly destinationPosition: Readonly<AccrualPosition>;
  readonly reallocations: readonly VaultV2BlueReallocation[];
  readonly referralFeePct: bigint;
  readonly now: bigint;
}): void {
  const allocations = getBlueBundlesV1PublicAllocations(
    reallocations,
    destinationMarketParams,
  );
  const penaltyAssets = getBlueBundlesV1PenaltyAssets(allocations);
  const accrualTimestamp =
    MathLib.max(
      now,
      sourcePosition.market.lastUpdate,
      destinationPosition.market.lastUpdate,
    ) + Time.s.from.h(2n);
  const source = sourcePosition.accrueInterest(accrualTimestamp);
  const destination = destinationPosition.accrueInterest(accrualTimestamp);
  const feeAssets = getBlueBundlesV1ReferralFeeAssets(
    source.borrowAssets,
    referralFeePct,
  );
  // Health is checked before authorizing or encoding the migration; the contract rechecks maxLtv.
  validatePositionHealth({
    positionData: destination,
    additionalCollateral: source.collateral,
    borrowAmount: source.borrowAssets + penaltyAssets + feeAssets,
    marketId: destinationMarketParams.id,
    lltv: destinationMarketParams.lltv,
  });
}
