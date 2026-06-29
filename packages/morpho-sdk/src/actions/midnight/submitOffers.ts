import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";
import type {
  MidnightSubmitOffersAction,
  Transaction,
} from "../../types/index.js";

/** Parameters for {@link midnightSubmitOffers}. */
export interface MidnightSubmitOffersParams {
  readonly chainId: number;
  readonly group: Hex;
  readonly root: Hex;
  readonly maker: Address;
  readonly ratifier: Address;
  readonly ratifierType: "ecrecover" | "setter";
  readonly offers: number;
  readonly payload: Hex;
}

/** Encodes the Midnight mempool payload submission transaction. */
export const midnightSubmitOffers = (
  params: MidnightSubmitOffersParams,
): Readonly<Transaction<MidnightSubmitOffersAction>> => {
  const midnightMempool = getChainAddress(params.chainId, "midnightMempool");

  return deepFreeze({
    to: midnightMempool,
    value: 0n,
    data: params.payload,
    action: {
      type: "midnightSubmitOffers" as const,
      args: {
        group: params.group,
        root: params.root,
        maker: params.maker,
        ratifier: params.ratifier,
        ratifierType: params.ratifierType,
        offers: params.offers,
      },
    },
  });
};
