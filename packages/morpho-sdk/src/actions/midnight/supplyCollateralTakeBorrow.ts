import { midnightBundlesAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { encodeFunctionData, maxUint256, zeroAddress } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateTakeableOffers } from "../../helpers/validateTakeableOffers.js";
import {
  type MidnightSupplyCollateralTakeBorrowAction,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import { resolveMidnightCollateralSupplies } from "./collateralAmounts.js";
import type { MidnightTakeBorrowParams } from "./takeBorrow.js";
import {
  type MidnightCollateralAmount,
  type MidnightCollateralSupply,
  PermitKind,
} from "./types.js";

/** Parameters for encoding a collateral supply followed by a Midnight borrow take. */
export interface MidnightSupplyCollateralTakeBorrowParams
  extends MidnightTakeBorrowParams {
  readonly collateralAssets: bigint;
  readonly collateralIndex?: bigint;
}

/**
 * Parameters for encoding several collateral supplies followed by a Midnight
 * borrow take. Entries are encoded in order; each index may appear once.
 */
export interface MidnightSupplyCollateralListTakeBorrowParams
  extends MidnightTakeBorrowParams {
  readonly collateralSupplies: readonly MidnightCollateralAmount[];
  readonly collateralAssets?: never;
  readonly collateralIndex?: never;
}

/**
 * Encodes a Midnight bundle that supplies collateral and borrows in one call.
 *
 * Prefer `client.morpho.midnight(chainId).supplyCollateralTakeBorrow(...)` in
 * app flows so collateral approval and Midnight authorization requirements are
 * resolved before building the bundle. Use this low-level builder only after
 * market data and API takeable offers are already available.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundles`.
 * @param params.market - Midnight market traded by every takeable offer.
 * @param params.loanAssets - Loan assets the borrower receives.
 * @param params.maxUnits - Maximum debt units accepted from the bundle quote.
 * @param params.taker - Borrower address executing the bundle.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.takeableOffers - ABI-ready lend-side offers returned by the Midnight API.
 * @param params.collateralAssets - Collateral assets supplied before taking offers (single-collateral form).
 * @param params.collateralIndex - Optional collateral index for `collateralAssets`; defaults to `0n`.
 * @param params.collateralSupplies - Collateral supplied before taking offers, one entry per unique index, encoded in order (multi-collateral form).
 * @returns A deep-frozen `Transaction<MidnightSupplyCollateralTakeBorrowAction>` targeting `MidnightBundles`.
 * @throws {NonPositiveInputError} when loan assets or `maxUnits` is non-positive.
 * @throws {NegativeInputError} when `deadline` is negative.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when any offer is not lend-side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when any offer belongs to another market.
 * @throws {ConflictingMidnightCollateralInputError} when `collateralSupplies` is combined with `collateralAssets` or `collateralIndex`.
 * @throws {NonPositiveInputError} when any collateral amount is non-positive.
 * @throws {EmptyMidnightCollateralAmountsError} when `collateralSupplies` is empty.
 * @throws {DuplicateMidnightCollateralIndexError} when `collateralSupplies` repeats an index.
 * @throws {UnknownCollateralIndexError} when any collateral index is negative or not configured on the market.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightSupplyCollateralTakeBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightSupplyCollateralTakeBorrow({
 *   chainId: 8453,
 *   market: marketData.params,
 *   collateralAssets: 2_000_000n,
 *   loanAssets: 1_000_000n,
 *   maxUnits: 1_100_000n,
 *   taker: borrower,
 *   takeableOffers: quote.data.takeableOffers,
 *   deadline: maxUint256,
 * });
 *
 * const multiCollateralTx = midnightSupplyCollateralTakeBorrow({
 *   chainId: 8453,
 *   market: marketData.params,
 *   collateralSupplies: [
 *     { collateralIndex: 0n, assets: 1_000_000n },
 *     { collateralIndex: 1n, assets: 50_000n },
 *   ],
 *   loanAssets: 1_000_000n,
 *   maxUnits: 1_100_000n,
 *   taker: borrower,
 *   takeableOffers: quote.data.takeableOffers,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightSupplyCollateralTakeBorrow = (
  params:
    | MidnightSupplyCollateralTakeBorrowParams
    | MidnightSupplyCollateralListTakeBorrowParams,
): Readonly<Transaction<MidnightSupplyCollateralTakeBorrowAction>> => {
  if (params.loanAssets <= 0n) {
    throw new NonPositiveInputError("loanAssets", params.loanAssets);
  }
  if (params.maxUnits <= 0n) {
    throw new NonPositiveInputError("maxUnits", params.maxUnits);
  }
  if (params.deadline < 0n) {
    throw new NegativeInputError("deadline", params.deadline);
  }
  // Reject markets from another chain deployment before encoding the bundle.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = validateTakeableOffers({
    market: params.market,
    takeableOffers: params.takeableOffers,
    expectedBuy: true,
  });

  const midnightBundles = getChainAddress(params.chainId, "midnightBundles");
  const collateralAmounts = resolveMidnightCollateralSupplies(
    params.market,
    params,
  );
  const collateralSupplies: readonly MidnightCollateralSupply[] =
    collateralAmounts.map((supply) => ({
      ...supply,
      permit: { kind: PermitKind.None, data: "0x" },
    }));

  let tx = {
    to: midnightBundles,
    value: 0n,
    data: encodeFunctionData({
      abi: midnightBundlesAbi,
      functionName: "midnightBundlesV1SupplyCollateralAndSellWithAssetsTarget",
      args: [
        params.loanAssets,
        params.maxUnits,
        params.taker,
        false,
        params.taker,
        collateralSupplies,
        params.takeableOffers,
        0n,
        zeroAddress,
        maxUint256,
        params.deadline,
      ],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightSupplyCollateralTakeBorrow",
      args: {
        market: marketId,
        collateralAssets: collateralAmounts.reduce(
          (total, supply) => total + supply.assets,
          0n,
        ),
        collateralAmounts,
        loanAssets: params.loanAssets,
        maxUnits: params.maxUnits,
        taker: params.taker,
        receiver: params.taker,
        collateralSupplies: collateralSupplies.length,
        takeableOffers: params.takeableOffers.length,
        deadline: params.deadline,
      },
    },
  });
};
