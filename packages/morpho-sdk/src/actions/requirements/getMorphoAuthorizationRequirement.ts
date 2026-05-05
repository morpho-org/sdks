import { getChainAddresses } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Client,
  encodeFunctionData,
  publicActions,
  type Transport,
} from "viem";
import type {
  MorphoAuthorizationAction,
  Transaction,
} from "../../types/index.js";

/**
 * Resolves whether `GeneralAdapter1` needs Morpho authorization for the given user, and returns
 * the `setAuthorization(generalAdapter1, true)` transaction when it does.
 *
 * Reads `Morpho.isAuthorized(userAddress, generalAdapter1)` on the target chain. Required before
 * any bundled MarketV1 path that operates on behalf of the user (`borrow`,
 * `supplyCollateralBorrow`, `repayWithdrawCollateral`).
 *
 * @param params.viemClient - viem `Client` for the target chain.
 * @param params.chainId - Target chain id (used to resolve Morpho and `GeneralAdapter1`).
 * @param params.userAddress - The user that must authorize `GeneralAdapter1`.
 * @returns A deep-frozen `Transaction<MorphoAuthorizationAction>`, or `null` when authorization
 *   is already in place.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getMorphoAuthorizationRequirement } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const tx = await getMorphoAuthorizationRequirement({
 *   viemClient: client,
 *   chainId: 1,
 *   userAddress: borrower,
 * });
 * // tx is null when already authorized, otherwise satisfies Readonly<Transaction<MorphoAuthorizationAction>>
 * ```
 */
export const getMorphoAuthorizationRequirement = async (params: {
  viemClient: Client<Transport>;
  chainId: number;
  userAddress: Address;
}): Promise<Readonly<Transaction<MorphoAuthorizationAction>> | null> => {
  const { viemClient, chainId, userAddress } = params;

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
      type: "morphoAuthorization" as const,
      args: {
        authorized: generalAdapter1,
        isAuthorized: true,
      },
    },
  });
};
