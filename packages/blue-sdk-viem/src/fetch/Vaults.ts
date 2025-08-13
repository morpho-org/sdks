import { type Address, type Client, zeroAddress } from "viem";

import { AccrualVault, getChainAddresses } from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import type { DeploylessFetchParameters } from "../types";

import { abi, code } from "../queries/GetVaults";
import { fetchVault, transformDeploylessVaultRead } from "./Vault";
import { fetchVaultMarketAllocation } from "./VaultMarketAllocation";

export async function fetchVaults(
  addresses: Address[],
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { publicAllocator } = getChainAddresses(parameters.chainId);

  if (deployless) {
    try {
      const vaults = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [addresses, publicAllocator ?? zeroAddress],
      });

      return vaults.map(transformDeploylessVaultRead(publicAllocator));
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  return Promise.all(
    addresses.map((address) =>
      fetchVault(address, client, { deployless: false, ...parameters }),
    ),
  );
}

export async function fetchAccrualVaults(
  addresses: Address[],
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const vaults = await fetchVaults(addresses, client, parameters);

  return Promise.all(
    vaults.map(
      async (vault) =>
        new AccrualVault(
          vault,
          await Promise.all(
            Array.from(vault.withdrawQueue, (marketId) =>
              fetchVaultMarketAllocation(
                vault.address,
                marketId,
                client,
                parameters,
              ),
            ),
          ),
        ),
    ),
  );
}
