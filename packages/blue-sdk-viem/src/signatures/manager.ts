import { type ChainId, getChainAddresses } from "@morpho-org/blue-sdk";
import type { TypedDataDefinition } from "viem";

/** Message fields for Morpho Blue manager authorization typed data. */
export interface AuthorizationArgs {
  authorizer: string;
  authorized: string;
  isAuthorized: boolean;
  nonce: bigint;
  deadline: bigint;
}

const authorizationTypes = {
  Authorization: [
    { name: "authorizer", type: "address" },
    { name: "authorized", type: "address" },
    { name: "isAuthorized", type: "bool" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

/**
 * Builds Morpho Blue manager authorization typed data for signing.
 *
 * @param args - Authorization message fields.
 * @param chainId - Chain id whose Morpho Blue deployment verifies the signature.
 * @returns Typed data ready to pass to a wallet for signing.
 * @example
 * ```ts
 * import { ChainId } from "@morpho-org/blue-sdk";
 * import { getAuthorizationTypedData } from "@morpho-org/blue-sdk-viem";
 *
 * const typedData = getAuthorizationTypedData(
 *   {
 *     authorizer: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
 *     authorized: "0x6566194141Ff46B819C55E7137d8329898EcD06c",
 *     isAuthorized: true,
 *     nonce: 0n,
 *     deadline: 1_900_000_000n,
 *   },
 *   ChainId.EthMainnet,
 * );
 * ```
 */
export const getAuthorizationTypedData = (
  { authorizer, authorized, isAuthorized, nonce, deadline }: AuthorizationArgs,
  chainId: ChainId,
): TypedDataDefinition<typeof authorizationTypes, "Authorization"> => {
  return {
    domain: {
      chainId: chainId,
      verifyingContract: getChainAddresses(chainId).morpho,
    },
    types: authorizationTypes,
    message: {
      authorizer,
      authorized,
      isAuthorized,
      nonce,
      deadline,
    },
    primaryType: "Authorization",
  };
};
