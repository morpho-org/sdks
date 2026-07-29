import { getChainAddresses } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { type Address, encodeFunctionData, publicActions } from "viem";
import {
  type AuthorizationRequirementSignature,
  type BlueAuthorizationAction,
  ChainIdMismatchError,
  type Requirement,
  type Transaction,
} from "../../../types/index.js";
import { encodeBlueSignatureAuthorization } from "../encode/encodeBlueSignatureAuthorization.js";

/**
 * Resolves whether `GeneralAdapter1` needs Blue authorization for the given user, and returns
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
 * @returns A deep-frozen `Transaction<BlueAuthorizationAction>`, a signable authorization
 *   `Requirement` (when `supportSignature` is `true`), or `null` when authorization is already in
 *   place.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getBlueAuthorizationRequirement } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const requirement = await getBlueAuthorizationRequirement({
 *   viemClient: client,
 *   chainId: 1,
 *   userAddress: borrower,
 *   supportSignature: true,
 * });
 * // requirement is null when already authorized, a Requirement when supportSignature is true,
 * // otherwise Readonly<Transaction<BlueAuthorizationAction>>
 * ```
 */
export const getBlueAuthorizationRequirement = async (params: {
  viemClient: Client;
  chainId: number;
  userAddress: Address;
  supportSignature?: boolean;
}): Promise<
  | Readonly<Transaction<BlueAuthorizationAction>>
  | Requirement<AuthorizationRequirementSignature>
  | null
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

  if (supportSignature) {
    // The signable path needs the user's Morpho nonce; fetch it alongside the
    // authorization status so both reads share a round-trip (batched into a
    // single multicall when the client enables batching) instead of
    // serializing the nonce read behind isAuthorized.
    const [isAuthorized, nonce] = await Promise.all([
      pc.readContract({
        address: morpho,
        abi: blueAbi,
        functionName: "isAuthorized",
        args: [userAddress, generalAdapter1],
      }),
      pc.readContract({
        address: morpho,
        abi: blueAbi,
        functionName: "nonce",
        args: [userAddress],
      }),
    ]);

    if (isAuthorized) {
      return null;
    }

    return encodeBlueSignatureAuthorization(viemClient, {
      authorized: generalAdapter1,
      chainId,
      nonce,
    });
  }

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
