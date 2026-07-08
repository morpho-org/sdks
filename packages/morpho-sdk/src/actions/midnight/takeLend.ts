import {
  type MarketInput,
  MarketUtils,
  midnightBundlesAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  encodeFunctionData,
  maxUint256,
  zeroAddress,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateOfferSides } from "../../helpers/validateOfferSides.js";
import {
  EmptyMidnightTakeableOffersError,
  type Metadata,
  MidnightTakeableOfferMarketMismatchError,
  type MidnightTakeLendAction,
  NegativeMidnightAmountError,
  NonPositiveMidnightAmountError,
  type Transaction,
} from "../../types/index.js";
import type { MidnightTakeableOffer } from "./types.js";

/** Parameters for encoding a Midnight lend take from already selected offers. */
export interface MidnightTakeLendParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly assets: bigint;
  readonly minUnits: bigint;
  readonly taker: Address;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

/**
 * Encodes a Midnight bundle that lends loan assets by taking borrow-side offers.
 *
 * Prefer `client.morpho.midnight(chainId).takeLend(...)` in app flows so
 * approval and authorization requirements are resolved first. Use this
 * low-level builder only after the Midnight API has returned takeable offers
 * and the caller has already handled prerequisites.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundles`.
 * @param params.market - Midnight market traded by every takeable offer.
 * @param params.assets - Loan assets the lender spends.
 * @param params.minUnits - Minimum units accepted from the bundle quote.
 * @param params.taker - Lender address executing the bundle.
 * @param params.takeableOffers - ABI-ready borrow-side offers returned by the Midnight API.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightTakeLendAction>` targeting `MidnightBundles`.
 * @throws {NonPositiveMidnightAmountError} when `assets <= 0n`.
 * @throws {NegativeMidnightAmountError} when `minUnits` or `deadline` is negative.
 * @throws {EmptyMidnightTakeableOffersError} when no offers are provided.
 * @throws {MidnightOfferSideMismatchError} when any offer is not borrow-side.
 * @throws {MidnightTakeableOfferMarketMismatchError} when any offer belongs to another market.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightTakeLend } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightTakeLend({
 *   chainId: 8453,
 *   market: marketData.params,
 *   assets: BigInt(quote.data.availableAssets),
 *   minUnits: BigInt(quote.data.availableUnits),
 *   taker: lender,
 *   takeableOffers: quote.data.takeableOffers,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightTakeLend = (
  params: MidnightTakeLendParams,
): Readonly<Transaction<MidnightTakeLendAction>> => {
  if (params.assets <= 0n) {
    throw new NonPositiveMidnightAmountError("assets", params.assets);
  }
  if (params.minUnits < 0n) {
    throw new NegativeMidnightAmountError("minUnits", params.minUnits);
  }
  if (params.deadline < 0n) {
    throw new NegativeMidnightAmountError("deadline", params.deadline);
  }
  if (params.takeableOffers.length === 0) {
    throw new EmptyMidnightTakeableOffersError();
  }

  const marketId = MarketUtils.toId(params.market);
  validateOfferSides(
    params.takeableOffers.map((take) => take.offer),
    false,
  );
  for (const [index, take] of params.takeableOffers.entries()) {
    const actualMarketId = MarketUtils.toId(take.offer.market);
    if (actualMarketId.toLowerCase() !== marketId.toLowerCase()) {
      throw new MidnightTakeableOfferMarketMismatchError({
        index,
        expectedMarket: marketId,
        actualMarket: actualMarketId,
      });
    }
  }

  const midnightBundles = getChainAddress(params.chainId, "midnightBundles");

  let tx = {
    to: midnightBundles,
    value: 0n,
    data: encodeFunctionData({
      abi: midnightBundlesAbi,
      functionName: "midnightBundlesV1BuyWithAssetsTargetAndWithdrawCollateral",
      args: [
        params.assets,
        params.minUnits,
        params.taker,
        false,
        { kind: 0, data: "0x" },
        params.takeableOffers,
        [],
        zeroAddress,
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
      type: "midnightTakeLend",
      args: {
        market: marketId,
        assets: params.assets,
        minUnits: params.minUnits,
        taker: params.taker,
        takeableOffers: params.takeableOffers.length,
        deadline: params.deadline,
      },
    },
  });
};
