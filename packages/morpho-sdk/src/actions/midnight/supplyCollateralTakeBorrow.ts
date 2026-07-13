import { MarketUtils, midnightBundlesAbi } from "@morpho-org/midnight-sdk";
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
import type { MidnightTakeBorrowParams } from "./takeBorrow.js";
import { type MidnightCollateralSupply, PermitKind } from "./types.js";

/** Parameters for encoding a collateral supply followed by a Midnight borrow take. */
export interface MidnightSupplyCollateralTakeBorrowParams
  extends MidnightTakeBorrowParams {
  readonly collateralAssets: bigint;
  readonly collateralIndex?: bigint;
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
 * @param params.collateralAssets - Collateral assets supplied before taking offers.
 * @param params.collateralIndex - Optional collateral index; defaults to `0n`.
 * @returns A deep-frozen `Transaction<MidnightSupplyCollateralTakeBorrowAction>` targeting `MidnightBundles`.
 * @throws {NonPositiveInputError} when collateral or loan assets are non-positive.
 * @throws {NegativeInputError} when `maxUnits` or `deadline` is negative.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when any offer is not lend-side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when any offer belongs to another market.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when `collateralIndex` is not configured on the market.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightSupplyCollateralTakeBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightSupplyCollateralTakeBorrow({
 *   chainId: 8453,
 *   market: marketData.params,
 *   collateralAssets: 2_000_000n,
 *   loanAssets: BigInt(quote.data.availableAssets),
 *   maxUnits: BigInt(quote.data.availableUnits),
 *   taker: borrower,
 *   takeableOffers: quote.data.takeableOffers,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightSupplyCollateralTakeBorrow = (
  params: MidnightSupplyCollateralTakeBorrowParams,
): Readonly<Transaction<MidnightSupplyCollateralTakeBorrowAction>> => {
  if (params.collateralAssets <= 0n) {
    throw new NonPositiveInputError(
      "collateralAssets",
      params.collateralAssets,
    );
  }
  if (params.loanAssets <= 0n) {
    throw new NonPositiveInputError("loanAssets", params.loanAssets);
  }
  if (params.maxUnits < 0n) {
    throw new NegativeInputError("maxUnits", params.maxUnits);
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
  const collateralIndex = params.collateralIndex ?? 0n;
  // Validate that the collateral index is configured before encoding the bundle.
  MarketUtils.getCollateralByIndex(params.market, collateralIndex);
  const collateralSupplies: readonly MidnightCollateralSupply[] = [
    {
      collateralIndex,
      assets: params.collateralAssets,
      permit: { kind: PermitKind.None, data: "0x" },
    },
  ];

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
        collateralAssets: params.collateralAssets,
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
