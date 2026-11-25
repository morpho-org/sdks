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
} from "../../types/index.js";
import { getBlueBundlesV1ReferralFeeAssets } from "./common.js";

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
  sourceMarketParams: Pick<
    MarketParams,
    "id" | "loanToken" | "collateralToken"
  >,
  destinationMarketParams: Pick<
    MarketParams,
    "id" | "loanToken" | "collateralToken"
  >,
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
  penaltyAssets,
  referralFeePct,
  now,
}: {
  readonly destinationMarketParams: Pick<MarketParams, "id" | "lltv">;
  readonly sourcePosition: Readonly<AccrualPosition>;
  readonly destinationPosition: Readonly<AccrualPosition>;
  readonly penaltyAssets: bigint;
  readonly referralFeePct: bigint;
  readonly now: bigint;
}): void {
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
