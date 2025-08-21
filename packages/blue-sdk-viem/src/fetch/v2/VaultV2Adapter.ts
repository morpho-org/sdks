import {
  UnsupportedChainIdError,
  UnsupportedVaultV2AdapterError,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { vaultV2MorphoVaultV1AdapterFactoryAbi } from "../../abis";
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

  const { vaultV2MorphoVaultV1AdapterFactory } = getChainAddresses(
    parameters.chainId,
  );

  if (!vaultV2MorphoVaultV1AdapterFactory)
    throw new UnsupportedChainIdError(parameters.chainId);

  const isMorphoVaultV1Adapter = await readContract(client, {
    ...parameters,
    address: vaultV2MorphoVaultV1AdapterFactory,
    abi: vaultV2MorphoVaultV1AdapterFactoryAbi,
    functionName: "isMorphoVaultV1Adapter",
    args: [address],
  });

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

  const { vaultV2MorphoVaultV1AdapterFactory } = getChainAddresses(
    parameters.chainId,
  );

  if (!vaultV2MorphoVaultV1AdapterFactory)
    throw new UnsupportedChainIdError(parameters.chainId);

  const isMorphoVaultV1Adapter = await readContract(client, {
    ...parameters,
    address: vaultV2MorphoVaultV1AdapterFactory,
    abi: vaultV2MorphoVaultV1AdapterFactoryAbi,
    functionName: "isMorphoVaultV1Adapter",
    args: [address],
  });

  if (isMorphoVaultV1Adapter)
    return fetchAccrualVaultV2MorphoVaultV1Adapter(address, client, parameters);

  throw new UnsupportedVaultV2AdapterError(address);
}
