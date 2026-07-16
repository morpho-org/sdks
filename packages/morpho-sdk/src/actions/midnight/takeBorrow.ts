import { type MarketInput, midnightBundlesAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  encodeFunctionData,
  maxUint256,
  zeroAddress,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateTakeableOffers } from "../../helpers/validateTakeableOffers.js";
import {
  type Metadata,
  type MidnightTakeBorrowAction,
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
  type Transaction,
} from "../../types/index.js";
import type { MidnightTakeableOffer } from "./types.js";

/** Parameters for encoding a Midnight borrow take from already selected offers. */
export interface MidnightTakeBorrowParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly loanAssets: bigint;
  readonly maxUnits: bigint;
  readonly taker: Address;
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  readonly metadata?: Metadata;
}

/**
 * Encodes a Midnight bundle that borrows loan assets by taking lend-side offers.
 *
 * Prefer `client.morpho.midnight(chainId).takeBorrow(...)` in app flows so
 * authorization requirements are resolved first. Use this low-level builder
 * only after the Midnight API has returned takeable offers and the caller has
 * already handled prerequisites.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundles`.
 * @param params.market - Midnight market traded by every takeable offer.
 * @param params.loanAssets - Loan assets the borrower receives.
 * @param params.maxUnits - Maximum debt units accepted from the bundle quote.
 * @param params.taker - Borrower address executing the bundle.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.takeableOffers - ABI-ready lend-side offers returned by the Midnight API.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightTakeBorrowAction>` targeting `MidnightBundles`.
 * @throws {NonPositiveMidnightAmountError} when `loanAssets` or `maxUnits` is non-positive.
 * @throws {NegativeMidnightAmountError} when `deadline` is negative.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when any offer is not lend-side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when any offer belongs to another market.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightTakeBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightTakeBorrow({
 *   chainId: 8453,
 *   market: marketData.params,
 *   loanAssets: BigInt(quote.data.availableAssets),
 *   maxUnits: BigInt(quote.data.availableUnits),
 *   taker: borrower,
 *   takeableOffers: quote.data.takeableOffers,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightTakeBorrow = (
  params: MidnightTakeBorrowParams,
): Readonly<Transaction<MidnightTakeBorrowAction>> => {
  if (params.loanAssets <= 0n) {
    throw new NonPositiveMidnightAmountError("loanAssets", params.loanAssets);
  }
  if (params.maxUnits <= 0n) {
    throw new NonPositiveMidnightAmountError("maxUnits", params.maxUnits);
  }
  if (params.deadline < 0n) {
    throw new NegativeMidnightAmountError("deadline", params.deadline);
  }
  // Reject markets from another chain deployment before encoding the bundle.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = validateTakeableOffers({
    market: params.market,
    takeableOffers: params.takeableOffers,
    expectedBuy: true,
  });

  const midnightBundles = getChainAddress(params.chainId, "midnightBundles");

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
        [],
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
      type: "midnightTakeBorrow",
      args: {
        market: marketId,
        loanAssets: params.loanAssets,
        maxUnits: params.maxUnits,
        taker: params.taker,
        receiver: params.taker,
        collateralSupplies: 0,
        takeableOffers: params.takeableOffers.length,
        deadline: params.deadline,
      },
    },
  });
};
