import { getChainAddresses } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { type Address, encodeFunctionData, publicActions } from "viem";
import {
  ChainIdMismatchError,
  type MorphoAuthorizationAction,
  type Requirement,
  type Transaction,
} from "../../types/index.js";
import { encodeAuthorization } from "./encode/encodeAuthorization.js";

/**
 * Resolves whether `GeneralAdapter1` needs Morpho authorization for the given user, and returns
 * the requirement to satisfy it when it does.
 *
 * Reads `Morpho.isAuthorized(userAddress, generalAdapter1)` on the target chain. Required before
 * any bundled Blue path that operates on behalf of the user (`borrow`, `withdraw`,
 * `supplyCollateralBorrow`, `repayWithdrawCollateral`, `refinance`).
 *
 * - When `supportSignature` is falsy (default), returns the
 *   `setAuthorization(generalAdapter1, true)` transaction the user submits before the bundle.
 * - When `supportSignature` is `true`, reads the user's Morpho `nonce` and returns a signable
 *   `Requirement`; the signed authorization is folded into the bundle via
 *   `setAuthorizationWithSig`, removing the standalone transaction.
 *
 * @param params.viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params.chainId - Target chain id (used to resolve Morpho and `GeneralAdapter1`).
 * @param params.userAddress - The user that must authorize `GeneralAdapter1`.
 * @param params.supportSignature - When `true`, return a signable `Requirement` instead of a
 *   transaction so authorization can be bundled via `setAuthorizationWithSig`.
 * @returns A deep-frozen `Transaction<MorphoAuthorizationAction>`, a signable `Requirement`
 *   (when `supportSignature` is `true`), or `null` when authorization is already in place.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getMorphoAuthorizationRequirement } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const requirement = await getMorphoAuthorizationRequirement({
 *   viemClient: client,
 *   chainId: 1,
 *   userAddress: borrower,
 *   supportSignature: true,
 * });
 * // requirement is null when already authorized, a Requirement when supportSignature is true,
 * // otherwise Readonly<Transaction<MorphoAuthorizationAction>>
 * ```
 */
export const getMorphoAuthorizationRequirement = async (params: {
  viemClient: Client;
  chainId: number;
  userAddress: Address;
  supportSignature?: boolean;
}): Promise<
  Readonly<Transaction<MorphoAuthorizationAction>> | Requirement | null
> => {
  const { viemClient, chainId, userAddress, supportSignature } = params;

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

  if (supportSignature) {
    const nonce = await pc.readContract({
      address: morpho,
      abi: blueAbi,
      functionName: "nonce",
      args: [userAddress],
    });

    return encodeAuthorization(viemClient, {
      authorized: generalAdapter1,
      chainId,
      nonce,
    });
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
