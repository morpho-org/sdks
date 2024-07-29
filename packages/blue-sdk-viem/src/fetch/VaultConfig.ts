import { Address, Client } from "viem";

import {
  ChainId,
  ChainUtils,
  UnknownVaultConfigError,
  VaultConfig,
  _try,
} from "@morpho-org/blue-sdk";
import { getChainId, readContract } from "viem/actions";
import { metaMorphoAbi } from "../abis";

export async function fetchVaultConfig(
  address: Address,
  client: Client,
  { chainId }: { chainId?: ChainId } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  let config = _try(
    () => VaultConfig.get(address, chainId),
    UnknownVaultConfigError,
  );

  if (!config) {
    // always fetch at latest block because config is immutable
    const [asset, symbol, name, decimals, decimalsOffset] = await Promise.all([
      readContract(client, {
        address,
        abi: metaMorphoAbi,
        functionName: "asset",
      }),
      readContract(client, {
        address,
        abi: metaMorphoAbi,
        functionName: "symbol",
      }),
      readContract(client, {
        address,
        abi: metaMorphoAbi,
        functionName: "name",
      }),
      readContract(client, {
        address,
        abi: metaMorphoAbi,
        functionName: "decimals",
      }),
      readContract(client, {
        address,
        abi: metaMorphoAbi,
        functionName: "DECIMALS_OFFSET",
      }),
    ]);

    config = new VaultConfig(
      {
        address,
        asset,
        symbol,
        name,
        decimals: Number(decimals),
        decimalsOffset: BigInt(decimalsOffset),
      },
      chainId,
    );
  }

  return config;
}
