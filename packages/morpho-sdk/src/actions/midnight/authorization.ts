import { midnightAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import type {
  Metadata,
  MidnightAuthorizationAction,
  Transaction,
} from "../../types/index.js";

/** Parameters for {@link midnightAuthorization}. */
export interface MidnightAuthorizationParams {
  readonly chainId: number;
  readonly authorized: Address;
  readonly onBehalf: Address;
  readonly isAuthorized?: boolean;
  readonly metadata?: Metadata;
}

/** Encodes `Midnight.setIsAuthorized(authorized, true, onBehalf)`. */
export const midnightAuthorization = (
  params: MidnightAuthorizationParams,
): Readonly<Transaction<MidnightAuthorizationAction>> => {
  const isAuthorized = params.isAuthorized ?? true;
  const midnight = getChainAddress(params.chainId, "midnight");

  let tx = {
    to: midnight,
    value: 0n,
    data: encodeFunctionData({
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [params.authorized, isAuthorized, params.onBehalf],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightAuthorization",
      args: {
        authorized: params.authorized,
        isAuthorized,
        onBehalf: params.onBehalf,
      },
    },
  });
};
