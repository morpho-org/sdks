import { InvalidTreeError } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import type {
  MempoolSubmitOffersAction,
  Metadata,
  Transaction,
} from "../../types/index.js";

/** Parameters for publishing an already ratified Midnight offer payload. */
export interface MempoolSubmitOffersParams {
  readonly chainId: number;
  readonly groups: readonly Hex[];
  readonly root: Hex;
  readonly maker: Address;
  readonly ratifier: Address;
  readonly ratifierType: "ecrecover" | "setter";
  readonly offers: number;
  readonly payload: Hex;
  readonly metadata?: Metadata;
}

/**
 * Encodes a Midnight mempool payload submission transaction.
 *
 * App make-offer flows should call `getOffersData`, gather the returned
 * requirements, then call the output `buildTx(signatures)`. Use this builder
 * directly only when the payload has already been encoded with ratifier data
 * and the caller wants to submit those bytes to the mempool contract.
 *
 * @param params.chainId - Chain id used to resolve `MidnightMempool`.
 * @param params.groups - Group ids included in the payload.
 * @param params.root - Offer tree root committed by the maker.
 * @param params.maker - Maker whose offers are submitted.
 * @param params.ratifier - Ratifier address shared by the offer tree.
 * @param params.ratifierType - Ratifier route used to build the payload.
 * @param params.offers - Number of non-padding offers in the payload.
 * @param params.payload - Encoded mempool payload bytes.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MempoolSubmitOffersAction>` targeting `MidnightMempool`.
 * @throws {InvalidTreeError} when `offers <= 0`.
 * @example
 * ```ts
 * import { MidnightPayload } from "@morpho-org/morpho-sdk/utils";
 * import { mempoolSubmitOffers } from "@morpho-org/morpho-sdk";
 *
 * const payload = await MidnightPayload.encode(items);
 * const tx = mempoolSubmitOffers({
 *   chainId: 8453,
 *   groups,
 *   root: tree.root,
 *   maker,
 *   ratifier,
 *   ratifierType: "ecrecover",
 *   offers: tree.offers.length,
 *   payload,
 * });
 * ```
 */
export const mempoolSubmitOffers = (
  params: MempoolSubmitOffersParams,
): Readonly<Transaction<MempoolSubmitOffersAction>> => {
  if (params.offers <= 0) {
    throw new InvalidTreeError("Tree must contain at least one offer.");
  }

  const midnightMempool = getChainAddress(params.chainId, "midnightMempool");

  let tx = {
    to: midnightMempool,
    value: 0n,
    data: params.payload,
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "mempoolSubmitOffers" as const,
      args: {
        groups: [...params.groups],
        root: params.root,
        maker: params.maker,
        ratifier: params.ratifier,
        ratifierType: params.ratifierType,
        offers: params.offers,
      },
    },
  });
};
