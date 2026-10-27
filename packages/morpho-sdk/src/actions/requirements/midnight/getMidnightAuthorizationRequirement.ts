import { midnightAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, type Client, encodeFunctionData } from "viem";
import { readContract } from "viem/actions";
import { validateChainId } from "../../../helpers/index.js";
import { validateMidnightAccount } from "../../../helpers/validateMidnightAccount.js";
import { validateMidnightAuthorizationTarget } from "../../../helpers/validateMidnightAuthorizationTarget.js";
import type {
  MidnightAuthorizationAction,
  Transaction,
} from "../../../types/index.js";
import { validateClientChainId } from "../validateClientChainId.js";

/** Parameters for {@link getMidnightAuthorizationRequirement}. */
export interface GetMidnightAuthorizationRequirementParams {
  readonly viemClient: Client;
  readonly chainId: number;
  readonly owner: Address;
  readonly authorized: Address;
}

/**
 * Resolves the Midnight authorization transaction for a Midnight bundle operator.
 *
 * Call before actions that rely on `Midnight.isAuthorized(owner, authorized)`.
 * MidnightBundlesV2 taker and cancel-and-make flows, including
 * `repayWithdrawCollateral`, authorize `MidnightBundlesV2`. Entity flows call
 * this from `getRequirements()` and omit the transaction when authorization is
 * already set.
 *
 * @param params.viemClient - Viem client used to read `Midnight.isAuthorized`.
 * @param params.chainId - Chain id expected by the viem client.
 * @param params.owner - Account granting authorization.
 * @param params.authorized - MidnightBundlesV2.
 * @returns Authorization transaction, or `null` when already authorized.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId`,
 *   another chain than `params.chainId`.
 * @throws {MidnightCalldataEncodingError} when `owner` or `authorized` is not a well-formed address.
 * @throws {MidnightZeroAccountError} when `owner` is the zero address.
 * @throws {viem.BaseError} when the `eth_chainId` request or authorization read fails.
 * @throws {UnsupportedMidnightAuthorizationTargetError} when `authorized` is not MidnightBundlesV2.
 * @example
 * ```ts
 * import { getChainAddress } from "@morpho-org/morpho-sdk/addresses";
 * import { getMidnightAuthorizationRequirement } from "@morpho-org/morpho-sdk";
 *
 * const chainId = 8453;
 * const midnightBundlesV2 = getChainAddress(chainId, "midnightBundlesV2");
 * const tx = await getMidnightAuthorizationRequirement({
 *   viemClient: client,
 *   chainId,
 *   owner: user,
 *   authorized: midnightBundlesV2,
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
  // Reject the zero account before reading state for it.
  validateMidnightAccount("owner", params.owner);
  validateChainId(params.viemClient.chain?.id, params.chainId);
  // Reject unknown operators before reading authorization state.
  validateMidnightAuthorizationTarget({
    chainId: params.chainId,
    authorized: params.authorized,
  });
  await validateClientChainId(params.viemClient, params.chainId);
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
