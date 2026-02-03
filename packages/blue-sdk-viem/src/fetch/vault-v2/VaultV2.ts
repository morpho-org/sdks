import {
  AccrualVaultV2,
  type IVaultV2Allocation,
  VaultV2,
  VaultV2MorphoMarketV1AdapterV2,
  VaultV2MorphoVaultV1Adapter,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import {
  type Address,
  type Client,
  type Hash,
  erc20Abi,
  zeroAddress,
} from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  morphoMarketV1AdapterV2FactoryAbi,
  morphoVaultV1AdapterFactoryAbi,
  vaultV2Abi,
} from "../../abis";
import { abi, code } from "../../queries/vault-v2/GetVaultV2";
import type { DeploylessFetchParameters } from "../../types";
import { fetchToken } from "../Token";
import { fetchAccrualVaultV2Adapter } from "./VaultV2Adapter";

export async function fetchVaultV2(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { morphoVaultV1AdapterFactory, morphoMarketV1AdapterV2Factory } =
    getChainAddresses(parameters.chainId);

  if (deployless) {
    try {
      const { token, isLiquidityAdapterKnown, liquidityAllocations, ...vault } =
        await readContract(client, {
          ...parameters,
          abi,
          code,
          functionName: "query",
          args: [
            address,
            morphoVaultV1AdapterFactory ?? zeroAddress,
            morphoMarketV1AdapterV2Factory ?? zeroAddress,
          ],
        });

      return new VaultV2({
        ...token,
        ...vault,
        address,
        adapters: [...vault.adapters],
        liquidityAllocations: isLiquidityAdapterKnown
          ? [...liquidityAllocations]
          : undefined,
      });
    } catch (error) {
      if (deployless === "force") throw error;
      // Fallback to multicall if deployless call fails.
    }
  }

  const [
    token,
    asset,
    totalSupply,
    totalAssets,
    _totalAssets,
    performanceFee,
    managementFee,
    virtualShares,
    lastUpdate,
    maxRate,
    liquidityAdapter,
    liquidityData,
    adaptersLength,
    performanceFeeRecipient,
    managementFeeRecipient,
  ] = await Promise.all([
    fetchToken(address, client, { ...parameters, deployless }),
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
      functionName: "totalAssets",
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
      functionName: "liquidityData",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "adaptersLength",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "performanceFeeRecipient",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "managementFeeRecipient",
    }),
  ]);

  const [
    hasMorphoVaultV1LiquidityAdapter,
    hasMorphoMarketV1AdapterV2LiquidityAdapter,
    ...adapters
  ] = await Promise.all([
    morphoVaultV1AdapterFactory != null && liquidityAdapter !== zeroAddress
      ? readContract(client, {
          address: morphoVaultV1AdapterFactory,
          abi: morphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
          args: [liquidityAdapter],
          ...parameters,
        })
      : undefined,
    morphoMarketV1AdapterV2Factory != null && liquidityAdapter !== zeroAddress
      ? readContract(client, {
          address: morphoMarketV1AdapterV2Factory,
          abi: morphoMarketV1AdapterV2FactoryAbi,
          functionName: "isMorphoMarketV1AdapterV2",
          args: [liquidityAdapter],
          ...parameters,
        })
      : undefined,
    ...Array.from({ length: Number(adaptersLength) }, (_, i) =>
      readContract(client, {
        ...parameters,
        address,
        abi: vaultV2Abi,
        functionName: "adapters",
        args: [BigInt(i)],
      }),
    ),
  ]);

  let liquidityAdapterIds: Hash[] | undefined;
  if (hasMorphoVaultV1LiquidityAdapter)
    liquidityAdapterIds = [
      VaultV2MorphoVaultV1Adapter.adapterId(liquidityAdapter),
    ];
  if (hasMorphoMarketV1AdapterV2LiquidityAdapter)
    liquidityAdapterIds = [
      VaultV2MorphoMarketV1AdapterV2.adapterId(liquidityAdapter),
    ];

  let liquidityAllocations: IVaultV2Allocation[] | undefined;
  if (liquidityAdapterIds != null)
    liquidityAllocations = await Promise.all(
      liquidityAdapterIds.map(async (id) => {
        const [absoluteCap, relativeCap, allocation] = await Promise.all([
          readContract(client, {
            ...parameters,
            address,
            abi: vaultV2Abi,
            functionName: "absoluteCap",
            args: [id],
          }),
          readContract(client, {
            ...parameters,
            address,
            abi: vaultV2Abi,
            functionName: "relativeCap",
            args: [id],
          }),
          readContract(client, {
            ...parameters,
            address,
            abi: vaultV2Abi,
            functionName: "allocation",
            args: [id],
          }),
        ]);

        return {
          id,
          absoluteCap,
          relativeCap,
          allocation,
        };
      }),
    );

  return new VaultV2({
    ...token,
    asset,
    totalAssets,
    _totalAssets,
    totalSupply,
    virtualShares,
    maxRate,
    lastUpdate,
    adapters,
    liquidityAdapter,
    liquidityData,
    liquidityAllocations,
    performanceFee,
    managementFee,
    performanceFeeRecipient,
    managementFeeRecipient,
  });
}

export async function fetchAccrualVaultV2(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const vaultV2 = await fetchVaultV2(address, client, parameters);

  const [assetBalance, liquidityAdapter, ...adapters] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: vaultV2.asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [vaultV2.address],
    }),
    vaultV2.liquidityAdapter !== zeroAddress
      ? fetchAccrualVaultV2Adapter(vaultV2.liquidityAdapter, client, parameters)
      : undefined,
    ...vaultV2.adapters.map(async (adapter) =>
      fetchAccrualVaultV2Adapter(adapter, client, parameters),
    ),
  ]);

  return new AccrualVaultV2(vaultV2, liquidityAdapter, adapters, assetBalance);
}
