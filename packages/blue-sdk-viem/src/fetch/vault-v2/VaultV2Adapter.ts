import {
  UnsupportedVaultV2AdapterError,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { morphoVaultV1AdapterFactoryAbi } from "../../abis";
import type { DeploylessFetchParameters } from "../../types";
import {
  fetchAccrualVaultV2MorphoVaultV1Adapter,
  fetchVaultV2MorphoVaultV1Adapter,
} from "./VaultV2MorphoVaultV1Adapter";

export async function fetchVaultV2Adapter(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);
  parameters.deployless ??= true;

  const { morphoVaultV1AdapterFactory } = getChainAddresses(parameters.chainId);

  const [isMorphoVaultV1Adapter] = await Promise.all([
    morphoVaultV1AdapterFactory
      ? readContract(client, {
          ...parameters,
          address: morphoVaultV1AdapterFactory,
          abi: morphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
          args: [address],
        })
      : false,
  ]);

  if (isMorphoVaultV1Adapter)
    return fetchVaultV2MorphoVaultV1Adapter(address, client, parameters);

  throw new UnsupportedVaultV2AdapterError(address);
}

export async function fetchAccrualVaultV2Adapter(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);
  parameters.deployless ??= true;

  const { morphoVaultV1AdapterFactory } = getChainAddresses(parameters.chainId);

  const [isMorphoVaultV1Adapter] = await Promise.all([
    morphoVaultV1AdapterFactory
      ? readContract(client, {
          ...parameters,
          address: morphoVaultV1AdapterFactory,
          abi: morphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
          args: [address],
        })
      : false,
  ]);

  if (isMorphoVaultV1Adapter)
    return fetchAccrualVaultV2MorphoVaultV1Adapter(address, client, parameters);

  throw new UnsupportedVaultV2AdapterError(address);
}
