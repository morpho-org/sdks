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
 * Resolves whether a supported operator needs Blue authorization for the given user, and returns
 * the requirement to satisfy it when it does.
 *
 * Reads `Morpho.isAuthorized(userAddress, authorized)` on the target chain.
 *
 * - When `supportSignature` is falsy (default), returns the
 *   `setAuthorization(authorized, true)` transaction the user submits before the operation.
 * - When `supportSignature` is `true`, reads the user's Morpho `nonce` and returns a signable
 *   `Requirement`. The selected route consumes the result: Bundler3 emits
 *   `setAuthorizationWithSig`, while BlueBundlesV1 embeds its signed-authorization struct.
 *
 * @param params.viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params.chainId - Target chain id used to resolve Morpho and the default GeneralAdapter1.
 * @param params.userAddress - The user granting authorization.
 * @param params.authorized - Operator to authorize. Defaults to GeneralAdapter1; direct Blue
 *   writes pass the registered BlueBundlesV1 deployment.
 * @param params.deadline - Optional signature deadline forwarded to the authorization encoder.
 * @param params.supportSignature - When `true`, return a signable `Requirement` instead of a
 *   transaction so the destination route can consume the signed authorization.
 * @returns A deep-frozen `Transaction<BlueAuthorizationAction>`, a signable authorization
 *   `Requirement` (when `supportSignature` is `true`), or `null` when authorization is already in
 *   place.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {viem.BaseError} when an authorization or nonce RPC read fails.
 * @example
 * ```ts
 * import { createPublicClient, http, zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getBlueAuthorizationRequirement } from "@morpho-org/morpho-sdk";
 * import { getChainAddress } from "@morpho-org/morpho-ts";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const blueBundlesV1 = getChainAddress(mainnet.id, "bundles.blueBundlesV1");
 * const requirement = await getBlueAuthorizationRequirement({
 *   viemClient: client,
 *   chainId: mainnet.id,
 *   userAddress: zeroAddress,
 *   supportSignature: true,
 *   authorized: blueBundlesV1,
 *   deadline: 1_900_000_000n,
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
  authorized?: Address;
  deadline?: bigint;
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

  const authorized = params.authorized ?? generalAdapter1;
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
        args: [userAddress, authorized],
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
      authorized,
      chainId,
      nonce,
      deadline: params.deadline,
    });
  }

  const isAuthorized = await pc.readContract({
    address: morpho,
    abi: blueAbi,
    functionName: "isAuthorized",
    args: [userAddress, authorized],
  });

  if (isAuthorized) {
    return null;
  }

  return deepFreeze({
    to: morpho,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "setAuthorization",
      args: [authorized, true],
    }),
    value: 0n,
    action: {
      type: "blueAuthorization" as const,
      args: {
        authorized,
        isAuthorized: true,
      },
    },
  });
};
