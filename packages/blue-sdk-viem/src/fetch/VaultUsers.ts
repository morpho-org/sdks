import type { Address, Client } from "viem";

import { getChainId, readContract } from "viem/actions";
import { abi, code } from "../queries/GetVaultUsers";
import type { DeploylessFetchParameters } from "../types";
import { fetchVaultUser, transformDeploylessVaultUserRead } from "./VaultUser";

export async function fetchVaultUsers(
  vaultUsers: { vault: Address; user: Address }[],
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  if (deployless) {
    try {
      const resVaultUsers = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [vaultUsers],
      });

      return vaultUsers.map((req, i) =>
        transformDeploylessVaultUserRead(req, resVaultUsers[i]!),
      );
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  return Promise.all(
    vaultUsers.map(({ vault, user }) =>
      fetchVaultUser(vault, user, client, parameters),
    ),
  );
}
