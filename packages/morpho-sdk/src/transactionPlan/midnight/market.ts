import { MarketUtils, type OfferStruct } from "@morpho-org/midnight-sdk";
import type { MidnightTakeableOffer } from "../../actions/midnight/types.js";
import { InvalidBigIntInputError } from "../../types/error.js";
import type { MidnightCollateralTransfer } from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import { getPlanObject } from "../validation.js";

/** @internal Projects a stored market and its collaterals onto the fields consumed by Midnight. */
export function storedMarketTuple({
  chainId,
  midnight,
  loanToken,
  collateralParams,
  maturity,
  rcfThreshold,
  enterGate,
  liquidatorGate,
}: OfferStruct["market"]): OfferStruct["market"] {
  return {
    chainId,
    midnight,
    loanToken,
    collateralParams: collateralParams.map(
      ({ token, lltv, liquidationCursor, oracle }) => ({
        token,
        lltv,
        liquidationCursor,
        oracle,
      }),
    ),
    maturity,
    rcfThreshold,
    enterGate,
    liquidatorGate,
  };
}

/**
 * @internal Rejects collateral that is not in strictly ascending token order. Midnight sorts the
 * market's collateral, so a stored `collateralIndex` names the token it shows only in that order.
 */
export function validateStoredCollateralOrder(
  collateralParams: OfferStruct["market"]["collateralParams"],
  path: string,
): void {
  for (const [index, collateral] of collateralParams.entries()) {
    const previous = collateralParams[index - 1];
    if (
      previous &&
      MarketUtils.compareCollateralTokens(previous, collateral) >= 0
    ) {
      throw new InvalidTransactionPlanError({
        path,
        reason:
          "expected collateral tokens in strictly ascending address order",
      });
    }
  }
}

/** @internal Projects quote fills onto the fields consumed by Midnight. */
export function storedFills(takeableOffers: readonly MidnightTakeableOffer[]) {
  return takeableOffers.map(({ units, offer, ratifierData }) => ({
    units,
    offer: {
      market: storedMarketTuple(offer.market),
      buy: offer.buy,
      maker: offer.maker,
      start: offer.start,
      expiry: offer.expiry,
      tick: offer.tick,
      group: offer.group,
      callback: offer.callback,
      callbackData: offer.callbackData,
      receiverIfMakerIsSeller: offer.receiverIfMakerIsSeller,
      ratifier: offer.ratifier,
      reduceOnly: offer.reduceOnly,
      maxUnits: offer.maxUnits,
      maxAssets: offer.maxAssets,
      continuousFeeCap: offer.continuousFeeCap,
    },
    ratifierData,
  }));
}

/**
 * Rejects a supplied collateral price that is not a bigint before the health check converts it.
 * Missing entries stay allowed: only the health check knows which prices it needs. @internal
 */
export function validateCollateralPriceTypes(prices: readonly bigint[]): void {
  if (!Array.isArray(prices)) {
    throw new InvalidTransactionPlanError({
      path: "$.collateralPrices",
      reason: "expected an array",
    });
  }
  for (const [index, price] of prices.entries()) {
    if (price !== undefined && typeof price !== "bigint") {
      throw new InvalidBigIntInputError(`collateralPrices[${index}]`, price);
    }
  }
}

/**
 * @internal Rejects a collateral index that is not a bigint. Midnight's index lookup accepts a
 * number, but a stored plan must hold a bigint to be restored.
 */
export function validateCollateralIndexTypes(
  field: string,
  entries: readonly { readonly collateralIndex: bigint }[],
): void {
  for (const [index, { collateralIndex }] of entries.entries()) {
    if (typeof collateralIndex !== "bigint") {
      throw new InvalidBigIntInputError(
        `${field}[${index}].collateralIndex`,
        collateralIndex,
      );
    }
  }
}

/**
 * @internal Rejects collateral transfer inputs a parse constructor cannot read with a typed error:
 * a list that is not an array, an entry that is not an object, or a non-bigint index or amount.
 */
export function validateCollateralTransferInputs(
  field: string,
  entries: readonly MidnightCollateralTransfer[],
): void {
  if (!Array.isArray(entries)) {
    throw new InvalidTransactionPlanError({
      path: `$.${field}`,
      reason: "expected an array",
    });
  }
  for (const [index, entry] of entries.entries()) {
    // Validation only; a hole or null entry would otherwise throw a native TypeError.
    getPlanObject(entry, `$.${field}[${index}]`);
  }
  validateCollateralIndexTypes(field, entries);
  for (const [index, { assets }] of entries.entries()) {
    if (typeof assets !== "bigint") {
      throw new InvalidBigIntInputError(`${field}[${index}].assets`, assets);
    }
  }
}
