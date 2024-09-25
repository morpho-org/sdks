import { Address, Client } from "viem";

import {
  ChainUtils,
  UnknownVaultConfigError,
  VaultConfig,
  _try,
} from "@morpho-org/blue-sdk";
import { getChainId, readContract } from "viem/actions";
import { metaMorphoAbi } from "../abis";
import { FetchParameters } from "../types";

export async function fetchVaultConfig(
  address: Address,
  client: Client,
  { chainId }: Pick<FetchParameters, "chainId"> = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  let config = _try(
    () => VaultConfig.get(address, chainId!),
    UnknownVaultConfigError,
  );

  if (!config) {
    // Always fetch at latest block because config is immutable.
    const [asset, symbol, name, decimals, decimalsOffset] = await Promise.all([
      readContract(client, {
        address,
        abi: metaMorphoAbi,
        functionName: "asset",
        blockTag: "latest",
      }),
      readContract(client, {
        address,
        abi: metaMorphoAbi,
        functionName: "symbol",
        blockTag: "latest",
      }),
      readContract(client, {
        address,
        abi: metaMorphoAbi,
        functionName: "name",
        blockTag: "latest",
      }),
      readContract(client, {
        address,
        abi: metaMorphoAbi,
        functionName: "decimals",
        blockTag: "latest",
      }),
      readContract(client, {
        address,
        abi: metaMorphoAbi,
        functionName: "DECIMALS_OFFSET",
        blockTag: "latest",
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
