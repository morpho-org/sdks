import { type Address, type Client, erc20Abi } from "viem";

import { VaultUser } from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import type { DeploylessFetchParameters } from "../types";

import { metaMorphoAbi } from "../abis";
import { abi, code } from "../queries/GetVaultUser";
import { fetchVaultConfig } from "./VaultConfig";

export async function fetchVaultUser(
  vault: Address,
  user: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

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

  const config = await fetchVaultConfig(vault, client, parameters);

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
