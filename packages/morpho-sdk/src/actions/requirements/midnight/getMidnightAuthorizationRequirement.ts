import { midnightAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, type Client, encodeFunctionData } from "viem";
import { readContract } from "viem/actions";
import { validateChainId } from "../../../helpers/index.js";
import type {
  MidnightAuthorizationAction,
  Transaction,
} from "../../../types/index.js";

/** Parameters for {@link getMidnightAuthorizationRequirement}. */
export interface GetMidnightAuthorizationRequirementParams {
  readonly viemClient: Client;
  readonly chainId: number;
  readonly owner: Address;
  readonly authorized: Address;
}

/**
 * Resolves the Midnight authorization transaction for a ratifier or bundle spender.
 *
 * Call before actions that rely on `Midnight.isAuthorized(owner, authorized)`,
 * such as bundle takes or Ecrecover offer-root ratification. Entity flows call
 * this from `getRequirements()` and omit the transaction when authorization is
 * already set.
 *
 * @param params.viemClient - Viem client used to read `Midnight.isAuthorized`.
 * @param params.chainId - Chain id expected by the viem client.
 * @param params.owner - Account granting authorization.
 * @param params.authorized - Spender or ratifier that needs authorization.
 * @returns Authorization transaction, or `null` when already authorized.
 * @throws {ChainIdMismatchError} when the viem client is connected to another chain.
 * @example
 * ```ts
 * import { getMidnightAuthorizationRequirement } from "@morpho-org/morpho-sdk";
 *
 * const tx = await getMidnightAuthorizationRequirement({
 *   viemClient: client,
 *   chainId: 8453,
 *   owner: user,
 *   authorized: midnightBundles,
 * });
 * if (tx) {
 *   await walletClient.sendTransaction({
 *     to: tx.to,
 *     data: tx.data,
 *     value: tx.value,
 *   });
 * }
 * ```
 */
export const getMidnightAuthorizationRequirement = async (
  params: GetMidnightAuthorizationRequirementParams,
): Promise<Readonly<Transaction<MidnightAuthorizationAction>> | null> => {
  validateChainId(params.viemClient.chain?.id, params.chainId);

  const midnight = getChainAddress(params.chainId, "midnight");
  const isAuthorized = await readContract(params.viemClient, {
    address: midnight,
    abi: midnightAbi,
    functionName: "isAuthorized",
    args: [params.owner, params.authorized],
  });

  if (isAuthorized) return null;

  return deepFreeze({
    to: midnight,
    value: 0n,
    data: encodeFunctionData({
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [params.authorized, true, params.owner],
    }),
    action: {
      type: "midnightAuthorization",
      args: {
        authorized: params.authorized,
        isAuthorized: true,
        onBehalf: params.owner,
      },
    },
  });
};
