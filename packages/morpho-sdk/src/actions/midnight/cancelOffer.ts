import { midnightAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, type Hex, maxUint256 } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import type {
  Metadata,
  MidnightCancelOfferAction,
  Transaction,
} from "../../types/index.js";

/** Parameters for {@link midnightCancelOffer}. */
export interface MidnightCancelOfferParams {
  readonly chainId: number;
  readonly group: Hex;
  readonly onBehalf: Address;
  readonly amount?: bigint;
  readonly metadata?: Metadata;
}

/** Encodes `Midnight.setConsumed(group, maxUint256, onBehalf)`. */
export const midnightCancelOffer = (
  params: MidnightCancelOfferParams,
): Readonly<Transaction<MidnightCancelOfferAction>> => {
  const midnight = getChainAddress(params.chainId, "midnight");
  const amount = params.amount ?? maxUint256;

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
