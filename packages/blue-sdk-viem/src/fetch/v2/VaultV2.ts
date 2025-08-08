import {
  AccrualVaultV2,
  UnsupportedChainIdError,
  VaultV2,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { type Address, type Client, erc20Abi } from "viem";
import { getChainId, readContract } from "viem/actions";
import { vaultV2Abi, vaultV2MorphoVaultV1AdapterFactoryAbi } from "../../abis";
import type { DeploylessFetchParameters } from "../../types";
import { fetchToken } from "../Token";
import { fetchAccrualVaultV2MorphoVaultV1Adapter } from "./VaultV2MorphoVaultV1Adapter";

export async function fetchVaultV2(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  if (deployless) {
    //TODO implement
  }

  const [
    token,
    asset,
    totalSupply,
    totalAssets,
    performanceFee,
    managementFee,
    virtualShares,
    lastUpdate,
    maxRate,
    liquidityAdapter,
    adaptersLength,
  ] = await Promise.all([
    fetchToken(address, client, parameters),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "asset",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "totalSupply",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "_totalAssets",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "performanceFee",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "managementFee",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "virtualShares",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "lastUpdate",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "maxRate",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "liquidityAdapter",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "adaptersLength",
    }),
  ]);

  const adapters = await Promise.all(
    Array.from({ length: Number(adaptersLength) }, (_, i) =>
      readContract(client, {
        ...parameters,
        address,
        abi: vaultV2Abi,
        functionName: "adapters",
        args: [BigInt(i)],
      }),
    ),
  );

  return new VaultV2({
    ...token,
    totalSupply,
    totalAssets,
    asset,
    performanceFee,
    managementFee,
    maxRate,
    virtualShares,
    lastUpdate,
    liquidityAdapter,
    adapters,
  });
}

export async function fetchAccrualVaultV2(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);
  const { vaultV2MorphoVaultV1AdapterFactory } = getChainAddresses(
    parameters.chainId,
  );

  if (!vaultV2MorphoVaultV1AdapterFactory)
    throw new UnsupportedChainIdError(parameters.chainId);

  const vaultV2 = await fetchVaultV2(address, client, parameters);

  const [assetBalance, ...adapters] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: vaultV2.asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [vaultV2.address],
    }),
    ...vaultV2.adapters.map(async (adapter) => {
      if (
        await readContract(client, {
          ...parameters,
          address: vaultV2MorphoVaultV1AdapterFactory,
          abi: vaultV2MorphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
          args: [adapter],
        })
      )
        return fetchAccrualVaultV2MorphoVaultV1Adapter(
          adapter,
          client,
          parameters,
        );

      throw "Unknown adapter type";
    }),
  ]);

  return new AccrualVaultV2(vaultV2, adapters, assetBalance);
}
