import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import type {
  MempoolSubmitOffersAction,
  Metadata,
  Transaction,
} from "../../types/index.js";

/** Parameters for {@link mempoolSubmitOffers}. */
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

/** Encodes the Midnight mempool payload submission transaction. */
export const mempoolSubmitOffers = (
  params: MempoolSubmitOffersParams,
): Readonly<Transaction<MempoolSubmitOffersAction>> => {
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
        groups: params.groups,
        root: params.root,
        maker: params.maker,
        ratifier: params.ratifier,
        ratifierType: params.ratifierType,
        offers: params.offers,
      },
    },
  });
};
