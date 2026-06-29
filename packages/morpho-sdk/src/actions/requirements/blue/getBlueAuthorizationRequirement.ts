import { getChainAddresses } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { type Address, encodeFunctionData, publicActions } from "viem";
import {
  type BlueAuthorizationAction,
  ChainIdMismatchError,
  type Transaction,
} from "../../../types/index.js";

/**
 * Resolves whether `GeneralAdapter1` needs Blue authorization for the given user, and returns
 * the `setAuthorization(generalAdapter1, true)` transaction when it does.
 *
 * Reads `Morpho.isAuthorized(userAddress, generalAdapter1)` on the target chain. Required before
 * any bundled Blue path that operates on behalf of the user (`borrow`,
 * `supplyCollateralBorrow`, `repayWithdrawCollateral`).
 *
 * @param params.viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params.chainId - Target chain id (used to resolve Morpho and `GeneralAdapter1`).
 * @param params.userAddress - The user that must authorize `GeneralAdapter1`.
 * @returns A deep-frozen `Transaction<BlueAuthorizationAction>`, or `null` when authorization
 *   is already in place.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getBlueAuthorizationRequirement } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const tx = await getBlueAuthorizationRequirement({
 *   viemClient: client,
 *   chainId: 1,
 *   userAddress: borrower,
 * });
 * // tx is null when already authorized, otherwise satisfies Readonly<Transaction<BlueAuthorizationAction>>
 * ```
 */
export const getBlueAuthorizationRequirement = async (params: {
  viemClient: Client;
  chainId: number;
  userAddress: Address;
}): Promise<Readonly<Transaction<BlueAuthorizationAction>> | null> => {
  const { viemClient, chainId, userAddress } = params;

  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  const {
    morpho,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const pc = viemClient.extend(publicActions);
  const isAuthorized = await pc.readContract({
    address: morpho,
    abi: blueAbi,
    functionName: "isAuthorized",
    args: [userAddress, generalAdapter1],
  });

  if (isAuthorized) {
    return null;
  }

  return deepFreeze({
    to: morpho,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "setAuthorization",
      args: [generalAdapter1, true],
    }),
    value: 0n,
    action: {
      type: "blueAuthorization" as const,
      args: {
        authorized: generalAdapter1,
        isAuthorized: true,
      },
    },
  });
};
