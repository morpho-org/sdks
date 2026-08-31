import { VaultUser } from "@morpho-org/blue-sdk";
import { type Address, type Client, erc20Abi } from "viem";

import { getChainId, readContract } from "viem/actions";
import { metaMorphoAbi } from "../abis.js";
import { abi, code } from "../queries/GetVaultUser.js";
import type { DeploylessFetchParameters } from "../types.js";
import { fetchVaultConfig } from "./VaultConfig.js";

/**
 * Fetches a user's MetaMorpho vault allowance and allocator status.
 *
 * Uses the deployless `GetVaultUser` query by default and falls back to the vault asset allowance
 * and `isAllocator(user)` reads when allowed.
 *
 * @param vault - MetaMorpho vault address.
 * @param user - User address whose vault state is fetched.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `VaultUser` entity.
 * @example
 * ```ts
 * import type { VaultUser } from "@morpho-org/blue-sdk";
 * import { fetchVaultUser } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
 * const user = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const vaultUser: VaultUser = await fetchVaultUser(vault, user, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultUser(
  vault: Address,
  user: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  /* v8 ignore next: V8 reports a negative false-branch count here; deployless=false is tested. */
  if (deployless) {
    try {
      const { isAllocator, allowance } = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [vault, user],
      });

      return new VaultUser({
        vault,
        user,
        isAllocator,
        allowance,
      });
    } catch (error) {
      if (deployless === "force") throw error;
      // Fallback to multicall if deployless call fails.
    }
  }

  const config = await fetchVaultConfig(vault, client, {
    ...parameters,
    deployless,
  });

  const [allowance, isAllocator] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: config.asset,
      abi: erc20Abi,
      functionName: "allowance",
      args: [user, vault],
    }),
    readContract(client, {
      ...parameters,
      address: vault,
      abi: metaMorphoAbi,
      functionName: "isAllocator",
      args: [user],
    }),
  ]);

  return new VaultUser({
    vault,
    user,
    isAllocator,
    allowance,
  });
}
