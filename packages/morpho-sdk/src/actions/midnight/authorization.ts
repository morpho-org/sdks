import { midnightAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import type {
  Metadata,
  MidnightAuthorizationAction,
  Transaction,
} from "../../types/index.js";

/** Parameters for encoding a direct Midnight `setIsAuthorized` call. */
export interface MidnightSetIsAuthorizedParams {
  readonly chainId: number;
  readonly authorized: Address;
  readonly onBehalf: Address;
  readonly isAuthorized?: boolean;
  readonly metadata?: Metadata;
}

/**
 * Encodes `Midnight.setIsAuthorized` for a bundle spender or ratifier.
 *
 * Prefer requirement helpers or entity `getRequirements()` in app flows; they
 * read `isAuthorized` first and return this transaction only when needed. Use
 * this builder directly when the caller intentionally wants to set or revoke
 * authorization without reading state.
 *
 * @param params.chainId - Chain id used to resolve `Midnight`.
 * @param params.authorized - Address receiving or losing authorization.
 * @param params.onBehalf - Owner whose authorization mapping is updated.
 * @param params.isAuthorized - Optional target state; defaults to `true`.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightAuthorizationAction>` targeting `Midnight`.
 * @example
 * ```ts
 * import { midnightSetIsAuthorized } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightSetIsAuthorized({
 *   chainId: 8453,
 *   authorized: midnightBundles,
 *   onBehalf: user,
 * });
 * ```
 */
export const midnightSetIsAuthorized = (
  params: MidnightSetIsAuthorizedParams,
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
