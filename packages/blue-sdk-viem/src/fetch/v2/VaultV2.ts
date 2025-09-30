import { AccrualVaultV2, VaultV2 } from "@morpho-org/blue-sdk";
import { type Address, type Client, erc20Abi } from "viem";
import { getChainId, readContract } from "viem/actions";
import { vaultV2Abi } from "../../abis";
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

  if (deployless) {
    try {
      const { token, ...vault } = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [address],
      });

      return new VaultV2({
        ...token,
        ...vault,
        address,
        adapters: [...vault.adapters],
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
