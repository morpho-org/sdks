import { getChainAddresses, User } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { blueAbi } from "../abis.js";
import type { FetchParameters } from "../types.js";

/**
 * Fetches Morpho Blue user authorization and nonce state.
 *
 * Reads `Morpho.isAuthorized(address, bundler3.generalAdapter1)` and `Morpho.nonce(address)`.
 *
 * @param address - User address to fetch.
 * @param client - Viem client used for the contract reads.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `User` entity.
 * @example
 * ```ts
 * import type { User } from "@morpho-org/blue-sdk";
 * import { fetchUser } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const address = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const user: User = await fetchUser(address, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchUser(
  address: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const {
    morpho,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(parameters.chainId);

  const [isBundlerAuthorized, morphoNonce] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: morpho,
      abi: blueAbi,
      functionName: "isAuthorized",
      args: [address, generalAdapter1],
    }),
    readContract(client, {
      ...parameters,
      address: morpho,
      abi: blueAbi,
      functionName: "nonce",
      args: [address],
    }),
  ]);

  return new User({
    address,
    isBundlerAuthorized,
    morphoNonce,
  });
}
