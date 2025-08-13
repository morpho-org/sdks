import {
  type Address,
  type Client,
  type ReadContractReturnType,
  erc20Abi,
} from "viem";

import { VaultUser } from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import type { DeploylessFetchParameters } from "../types";

import { metaMorphoAbi } from "../abis";
import { abi, code } from "../queries/GetVaultUser";
import { fetchVaultConfig } from "./VaultConfig";

export const transformDeploylessVaultUserRead = (
  { vault, user }: { vault: Address; user: Address },
  { isAllocator, allowance }: ReadContractReturnType<typeof abi, "query">,
) =>
  new VaultUser({
    vault,
    user,
    isAllocator,
    allowance,
  });

export async function fetchVaultUser(
  vault: Address,
  user: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  if (deployless) {
    try {
      const vaultUser = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [{ vault, user }],
      });

      return transformDeploylessVaultUserRead({ vault, user }, vaultUser);
    } catch {
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
