import type { Address, Client } from "viem";

import { ChainUtils, VaultConfig } from "@morpho-org/blue-sdk";
import { getChainId, readContract } from "viem/actions";
import { metaMorphoAbi } from "../abis";
import type { DeploylessFetchParameters } from "../types";
import { fetchToken } from "./Token";

export async function fetchVaultConfig(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  const [token, asset, decimalsOffset] = await Promise.all([
    fetchToken(address, client, parameters),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "asset",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "DECIMALS_OFFSET",
    }),
  ]);

  return new VaultConfig(
    {
      ...token,
      asset,
      decimalsOffset: BigInt(decimalsOffset),
    },
    parameters.chainId,
  );
}
