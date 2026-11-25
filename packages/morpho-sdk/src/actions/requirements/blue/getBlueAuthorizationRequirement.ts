import { getChainAddresses } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import {
  type Address,
  encodeFunctionData,
  isAddressEqual,
  publicActions,
} from "viem";
import {
  validateChainId,
  validateDeadline,
} from "../../../helpers/validate.js";
import {
  type AuthorizationRequirementSignature,
  type BlueAuthorizationAction,
  ExpiredDeadlineError,
  type ReferenceTimestampParams,
  type Requirement,
  type Transaction,
  UnsupportedAuthorizationOperatorError,
} from "../../../types/index.js";
import { type ChainCheck, createChainCheck } from "../chainCheck.js";
import {
  encodeParsedBlueSignatureAuthorization,
  parseBlueSignatureAuthorization,
} from "../encode/encodeBlueSignatureAuthorization.js";

declare const blueAuthorizationRequirementInput: unique symbol;
/** Complete checked authorization resolver invocation. @internal */
export type BlueAuthorizationRequirementInput = Readonly<
  Parameters<typeof getBlueAuthorizationRequirement>[0]
> & {
  readonly authorized: Address;
  readonly morpho: Address;
  readonly [blueAuthorizationRequirementInput]: true;
};

/** Owns operator defaults and static checks for this complete resolver call. @internal */
export const parseBlueAuthorizationRequirement = (
  params: Parameters<typeof getBlueAuthorizationRequirement>[0],
): BlueAuthorizationRequirementInput => {
  const input = {
    viemClient: params.viemClient,
    chainId: params.chainId,
    userAddress: params.userAddress,
    supportSignature: params.supportSignature,
    authorized: params.authorized,
    deadline: params.deadline,
    now: params.now,
  };
  validateChainId(input.viemClient.chain?.id, input.chainId);
  const { blue: morpho } = getChainAddresses(input.chainId);
  const blueBundlesV1 = getChainAddress(input.chainId, "bundles.blueBundlesV1");
  const authorized = input.authorized ?? blueBundlesV1;
  if (!isAddressEqual(blueBundlesV1, authorized)) {
    throw new UnsupportedAuthorizationOperatorError(authorized, input.chainId);
  }
  if (input.supportSignature && input.deadline != null) {
    validateDeadline(input.deadline);
  }
  return { ...input, authorized, morpho } as BlueAuthorizationRequirementInput;
};

/**
 * Resolves whether a supported operator needs Blue authorization for the given user, and returns
 * the requirement to satisfy it when it does.
 *
 * Reads `Morpho.isAuthorized(userAddress, authorized)` on the target chain.
 *
 * - When `supportSignature` is falsy (default), returns the
 *   `setAuthorization(authorized, true)` transaction the user submits before the operation.
 * - When `supportSignature` is `true`, reads the user's Morpho `nonce` and returns a signable
 *   `Requirement` consumed by BlueBundlesV1.
 *
 * @param params.viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params.chainId - Target chain id used to resolve Morpho and BlueBundlesV1.
 * @param params.userAddress - The user granting authorization.
 * @param params.authorized - Operator to authorize. Defaults to the chain's registered
 *   BlueBundlesV1 deployment and must match it.
 * @param params.deadline - Optional signature deadline forwarded to the authorization encoder.
 * @param params.now - See {@link ReferenceTimestampParams.now}.
 * @param params.supportSignature - When `true`, return a signable `Requirement` instead of a
 *   transaction so the destination route can consume the signed authorization.
 * @returns A deep-frozen `Transaction<BlueAuthorizationAction>`, a signable authorization
 *   `Requirement` (when `supportSignature` is `true`), or `null` when authorization is already in
 *   place.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId`, a
 *   chain other than `params.chainId`.
 * @throws {UnsupportedAuthorizationOperatorError} when `authorized` is not the chain's
 *   BlueBundlesV1 operator.
 * @throws {NonPositiveInputError} when a provided `deadline` is not positive.
 * @throws {InputExceedsMaxError} when a provided `deadline` exceeds `uint256`.
 * @throws {ExpiredDeadlineError} when a provided `deadline` is positive but not in the future.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when BlueBundlesV1 is not registered on the target chain.
 * @throws {viem.BaseError} when the `eth_chainId` request or an authorization or nonce RPC read
 *   fails.
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
export const getBlueAuthorizationRequirement = async (
  params: {
    readonly viemClient: Client;
    readonly chainId: number;
    readonly userAddress: Address;
    readonly supportSignature?: boolean;
    readonly authorized?: Address;
    readonly deadline?: bigint;
  } & ReferenceTimestampParams,
): Promise<
  | Readonly<Transaction<BlueAuthorizationAction>>
  | Requirement<AuthorizationRequirementSignature>
  | null
> => {
  return getParsedBlueAuthorizationRequirement(
    parseBlueAuthorizationRequirement(params),
  );
};

/** Reads authorization from the complete checked invocation, preserving RPC order. @internal */
export const getParsedBlueAuthorizationRequirement = async (
  params: BlueAuthorizationRequirementInput,
  chainCheck: ChainCheck = createChainCheck(params.viemClient, params.chainId),
): Promise<
  | Readonly<Transaction<BlueAuthorizationAction>>
  | Requirement<AuthorizationRequirementSignature>
  | null
> => {
  const {
    viemClient,
    chainId,
    userAddress,
    supportSignature,
    morpho,
    authorized,
  } = params;
  const pc = viemClient.extend(publicActions);

  if (supportSignature) {
    // The forwarded deadline is only consumed on the signable path; reject an invalid or expired
    // one before the RPC reads so the caller never signs an authorization that cannot be encoded
    // or would revert on-chain. An omitted deadline defaults downstream to two hours from now.
    if (params.deadline != null) {
      const timestamp = params.now ?? Time.timestamp();
      if (params.deadline <= timestamp) {
        throw new ExpiredDeadlineError(params.deadline, timestamp);
      }
    }
    await chainCheck();
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

    // Construct the complete child operation with the fresh nonce; its encoder rechecks expiry now.
    return encodeParsedBlueSignatureAuthorization(
      parseBlueSignatureAuthorization(viemClient, {
        owner: userAddress,
        authorized,
        chainId,
        nonce,
        deadline: params.deadline,
        now: params.now,
        isAuthorized: true,
      }),
    );
  }

  await chainCheck();
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
