import {
  UnsupportedVaultV2AdapterError,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  morphoMarketV1AdapterV2FactoryAbi,
  morphoVaultV1AdapterFactoryAbi,
} from "../../abis";
import { morphoMarketV1AdapterFactoryAbi } from "../../abis";
import type { DeploylessFetchParameters } from "../../types";
import { fetchVaultV2MorphoMarketV1Adapter } from "./VaultV2MorphoMarketV1Adapter";
import { fetchAccrualVaultV2MorphoMarketV1Adapter } from "./VaultV2MorphoMarketV1Adapter";
import {
  fetchAccrualVaultV2MorphoMarketV1AdapterV2,
  fetchVaultV2MorphoMarketV1AdapterV2,
} from "./VaultV2MorphoMarketV1AdapterV2";
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

  const {
    morphoVaultV1AdapterFactory,
    morphoMarketV1AdapterFactory,
    morphoMarketV1AdapterV2Factory,
  } = getChainAddresses(parameters.chainId);

  const [
    isMorphoVaultV1Adapter,
    isMorphoMarketV1Adapter,
    isMorphoMarketV1AdapterV2,
  ] = await Promise.all([
    morphoVaultV1AdapterFactory
      ? readContract(client, {
          ...parameters,
          address: morphoVaultV1AdapterFactory,
          abi: morphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
          args: [address],
        })
      : false,
    morphoMarketV1AdapterFactory
      ? readContract(client, {
          ...parameters,
          address: morphoMarketV1AdapterFactory,
          abi: morphoMarketV1AdapterFactoryAbi,
          functionName: "isMorphoMarketV1Adapter",
          args: [address],
        })
      : false,
    morphoMarketV1AdapterV2Factory
      ? readContract(client, {
          ...parameters,
          address: morphoMarketV1AdapterV2Factory,
          abi: morphoMarketV1AdapterV2FactoryAbi,
          functionName: "isMorphoMarketV1AdapterV2",
          args: [address],
        })
      : false,
  ]);

  if (isMorphoVaultV1Adapter)
    return fetchVaultV2MorphoVaultV1Adapter(address, client, parameters);

  if (isMorphoMarketV1Adapter)
    return fetchVaultV2MorphoMarketV1Adapter(address, client, parameters);

  if (isMorphoMarketV1AdapterV2)
    return fetchVaultV2MorphoMarketV1AdapterV2(address, client, parameters);

  throw new UnsupportedVaultV2AdapterError(address);
}

export async function fetchAccrualVaultV2Adapter(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);
  parameters.deployless ??= true;

  const {
    morphoVaultV1AdapterFactory,
    morphoMarketV1AdapterFactory,
    morphoMarketV1AdapterV2Factory,
  } = getChainAddresses(parameters.chainId);

  const [
    isMorphoVaultV1Adapter,
    isMorphoMarketV1Adapter,
    isMorphoMarketV1AdapterV2,
  ] = await Promise.all([
    morphoVaultV1AdapterFactory
      ? readContract(client, {
          ...parameters,
          address: morphoVaultV1AdapterFactory,
          abi: morphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
          args: [address],
        }).catch(() => false)
      : false,
    morphoMarketV1AdapterFactory
      ? readContract(client, {
          ...parameters,
          address: morphoMarketV1AdapterFactory,
          abi: morphoMarketV1AdapterFactoryAbi,
          functionName: "isMorphoMarketV1Adapter",
          args: [address],
        }).catch(() => false)
      : false,
    morphoMarketV1AdapterV2Factory
      ? readContract(client, {
          ...parameters,
          address: morphoMarketV1AdapterV2Factory,
          abi: morphoMarketV1AdapterV2FactoryAbi,
          functionName: "isMorphoMarketV1AdapterV2",
          args: [address],
        }).catch(() => false)
      : false,
  ]);

  if (isMorphoVaultV1Adapter)
    return fetchAccrualVaultV2MorphoVaultV1Adapter(address, client, parameters);

  if (isMorphoMarketV1Adapter)
    return fetchAccrualVaultV2MorphoMarketV1Adapter(
      address,
      client,
      parameters,
    );

  if (isMorphoMarketV1AdapterV2)
    return fetchAccrualVaultV2MorphoMarketV1AdapterV2(
      address,
      client,
      parameters,
    );

  throw new UnsupportedVaultV2AdapterError(address);
}
