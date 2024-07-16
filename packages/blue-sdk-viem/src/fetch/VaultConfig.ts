import {
  Account,
  Address,
  Chain,
  ParseAccount,
  PublicClient,
  RpcSchema,
  Transport,
} from "viem";

import {
  ChainId,
  ChainUtils,
  UnknownVaultConfigError,
  VaultConfig,
  _try,
} from "@morpho-org/blue-sdk";
import { metaMorphoAbi } from "../abis";

export async function fetchVaultConfig<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  address: Address,
  client: PublicClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >,
  { chainId }: { chainId?: ChainId } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await client.getChainId()),
  );

  let config = _try(
    () => VaultConfig.get(address, chainId),
    UnknownVaultConfigError,
  );

  if (!config) {
    // always fetch at latest block because config is immutable
    const [asset, symbol, name, decimals, decimalsOffset] = await Promise.all([
      client.readContract({
        address,
        abi: metaMorphoAbi,
        functionName: "asset",
      }),
      client.readContract({
        address,
        abi: metaMorphoAbi,
        functionName: "symbol",
      }),
      client.readContract({
        address,
        abi: metaMorphoAbi,
        functionName: "name",
      }),
      client.readContract({
        address,
        abi: metaMorphoAbi,
        functionName: "decimals",
      }),
      client.readContract({
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

declare module "@morpho-org/blue-sdk" {
  namespace VaultConfig {
    let fetch: typeof fetchVaultConfig;
  }
}

VaultConfig.fetch = fetchVaultConfig;
