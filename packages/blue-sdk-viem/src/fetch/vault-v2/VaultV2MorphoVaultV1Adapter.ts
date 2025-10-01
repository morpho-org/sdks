import {
  AccrualVaultV2MorphoVaultV1Adapter,
  VaultV2MorphoVaultV1Adapter,
} from "@morpho-org/blue-sdk";
import { type Address, type Client, erc20Abi } from "viem";
import { getChainId, readContract } from "viem/actions";
import { morphoVaultV1AdapterAbi } from "../../abis";
import {
  abi,
  code,
} from "../../queries/vault-v2/GetVaultV2MorphoVaultV1Adapter";
import type { DeploylessFetchParameters } from "../../types";
import { fetchAccrualVault } from "../Vault";

export async function fetchVaultV2MorphoVaultV1Adapter(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  if (deployless) {
    try {
      const adapter = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [address],
      });

      return new VaultV2MorphoVaultV1Adapter({ ...adapter, address });
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  const [parentVault, adapterId, skimRecipient, morphoVaultV1] =
    await Promise.all([
      readContract(client, {
        ...parameters,
        address,
        abi: morphoVaultV1AdapterAbi,
        functionName: "parentVault",
      }),
      readContract(client, {
        ...parameters,
        address,
        abi: morphoVaultV1AdapterAbi,
        functionName: "adapterId",
      }),
      readContract(client, {
        ...parameters,
        address,
        abi: morphoVaultV1AdapterAbi,
        functionName: "skimRecipient",
      }),
      readContract(client, {
        ...parameters,
        address,
        abi: morphoVaultV1AdapterAbi,
        functionName: "morphoVaultV1",
      }),
    ]);

  return new VaultV2MorphoVaultV1Adapter({
    morphoVaultV1,
    parentVault,
    adapterId,
    skimRecipient,
    address,
  });
}

export async function fetchAccrualVaultV2MorphoVaultV1Adapter(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  const adapter = await fetchVaultV2MorphoVaultV1Adapter(
    address,
    client,
    parameters,
  );
  const [vaultV1, shares] = await Promise.all([
    fetchAccrualVault(adapter.morphoVaultV1, client, parameters),
    readContract(client, {
      ...parameters,
      address: adapter.morphoVaultV1,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [adapter.address],
    }),
  ]);

  return new AccrualVaultV2MorphoVaultV1Adapter(adapter, vaultV1, shares);
}
