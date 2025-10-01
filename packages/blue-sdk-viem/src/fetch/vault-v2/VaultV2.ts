import {
  AccrualVaultV2,
  type IVaultV2Caps,
  VaultV2,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import {
  type Address,
  type Client,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  zeroAddress,
} from "viem";
import { getChainId, readContract } from "viem/actions";
import { morphoVaultV1AdapterFactoryAbi, vaultV2Abi } from "../../abis";
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

  const { morphoVaultV1AdapterFactory } = getChainAddresses(parameters.chainId);

  if (deployless) {
    try {
      const { token, isLiquidityAdapterKnown, liquidityCaps, ...vault } =
        await readContract(client, {
          ...parameters,
          abi,
          code,
          functionName: "query",
          args: [address, morphoVaultV1AdapterFactory ?? zeroAddress],
        });

      return new VaultV2({
        ...token,
        ...vault,
        address,
        adapters: [...vault.adapters],
        liquidityCaps: isLiquidityAdapterKnown
          ? {
              absolute: liquidityCaps.absoluteCap,
              relative: liquidityCaps.relativeCap,
            }
          : undefined,
        liquidityAllocation: isLiquidityAdapterKnown
          ? liquidityCaps.allocation
          : undefined,
      });
    } catch {
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
    adaptersLength,
    performanceFeeRecipient,
    managementFeeRecipient,
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

  const [hasMorphoVaultV1LiquidityAdapter, ...adapters] = await Promise.all([
    morphoVaultV1AdapterFactory != null && liquidityAdapter !== zeroAddress
      ? readContract(client, {
          address: morphoVaultV1AdapterFactory,
          abi: morphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
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

  let liquidityCaps: IVaultV2Caps | undefined;
  let liquidityAllocation: bigint | undefined;
  if (hasMorphoVaultV1LiquidityAdapter) {
    const liquidityAdapterId = keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", address],
      ),
    );

    const [absoluteCap, relativeCap, allocation] = await Promise.all([
      readContract(client, {
        ...parameters,
        address,
        abi: vaultV2Abi,
        functionName: "absoluteCap",
        args: [liquidityAdapterId],
      }),
      readContract(client, {
        ...parameters,
        address,
        abi: vaultV2Abi,
        functionName: "relativeCap",
        args: [liquidityAdapterId],
      }),
      readContract(client, {
        ...parameters,
        address,
        abi: vaultV2Abi,
        functionName: "allocation",
        args: [liquidityAdapterId],
      }),
    ]);

    liquidityCaps = { absolute: absoluteCap, relative: relativeCap };
    liquidityAllocation = allocation;
  }

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
    liquidityCaps,
    liquidityAllocation,
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

  const [assetBalance, ...adapters] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: vaultV2.asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [vaultV2.address],
    }),
    ...vaultV2.adapters.map(async (adapter) =>
      fetchAccrualVaultV2Adapter(adapter, client, parameters),
    ),
  ]);

  return new AccrualVaultV2(vaultV2, adapters, assetBalance);
}
