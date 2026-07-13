import { MAX_OFFER_CAP, midnightAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, type Hex } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import type {
  Metadata,
  MidnightCancelOfferAction,
  Transaction,
} from "../../types/index.js";

/** Parameters for encoding a Midnight group consumption update. */
export interface MidnightCancelOfferParams {
  readonly chainId: number;
  readonly group: Hex;
  readonly onBehalf: Address;
  readonly amount?: bigint;
  readonly metadata?: Metadata;
}

/**
 * Encodes `Midnight.setConsumed` to cancel or partially consume an offer group.
 *
 * App flows should usually call `client.morpho.midnight(chainId).cancelOffer(...)`.
 * Use this builder directly when the group id is already known and no
 * additional requirements are needed. Omitting `amount` fully cancels the group
 * by setting consumption to {@link MAX_OFFER_CAP}.
 *
 * @param params.chainId - Chain id used to resolve `Midnight`.
 * @param params.group - Offer group id to mark consumed.
 * @param params.onBehalf - Maker whose group consumption is updated.
 * @param params.amount - Optional consumed amount; defaults to {@link MAX_OFFER_CAP} for full cancellation.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightCancelOfferAction>` targeting `Midnight`.
 * @example
 * ```ts
 * import { midnightCancelOffer } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightCancelOffer({
 *   chainId: 8453,
 *   group,
 *   onBehalf: maker,
 * });
 * ```
 */
export const midnightCancelOffer = (
  params: MidnightCancelOfferParams,
): Readonly<Transaction<MidnightCancelOfferAction>> => {
  const midnight = getChainAddress(params.chainId, "midnight");
  const amount = params.amount ?? MAX_OFFER_CAP;

  let tx = {
    to: midnight,
    value: 0n,
    data: encodeFunctionData({
      abi: midnightAbi,
      functionName: "setConsumed",
      args: [params.group, amount, params.onBehalf],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightCancelOffer",
      args: {
        group: params.group,
        amount,
        onBehalf: params.onBehalf,
      },
    },
  });
};
