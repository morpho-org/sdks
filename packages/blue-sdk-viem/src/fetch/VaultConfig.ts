import { VaultConfig } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { metaMorphoAbi } from "../abis.js";
import type { DeploylessFetchParameters } from "../types.js";
import { fetchToken } from "./Token.js";

/**
 * Fetches immutable and token-derived MetaMorpho vault configuration.
 *
 * Reads token metadata through `fetchToken`, plus `asset()` and `DECIMALS_OFFSET()` from the vault.
 *
 * @param address - MetaMorpho vault address.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode forwarded to token metadata reads.
 * @returns The hydrated `VaultConfig` entity.
 * @example
 * ```ts
 * import type { VaultConfig } from "@morpho-org/blue-sdk";
 * import { fetchVaultConfig } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
 *
 * const config: VaultConfig = await fetchVaultConfig(vault, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultConfig(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const [token, asset, decimalsOffset] = await Promise.all([
    fetchToken(address, client, parameters), // TODO: avoid fetching decimals
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "asset",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "DECIMALS_OFFSET",
    }),
  ]);

  return new VaultConfig({
    ...token,
    asset,
    decimalsOffset: BigInt(decimalsOffset),
  });
}
