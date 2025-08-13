import { type Address, type Client, zeroAddress } from "viem";

import { NATIVE_ADDRESS, Token, getChainAddresses } from "@morpho-org/blue-sdk";
import { getChainId, readContract } from "viem/actions";
import { abi, code } from "../queries/GetTokens";
import type { DeploylessFetchParameters } from "../types";
import { fetchToken, transformDeploylessTokenRead } from "./Token";

export async function fetchTokens(
  addresses: Address[],
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  const chainId = (parameters.chainId ??= await getChainId(client));

  const { wstEth } = getChainAddresses(parameters.chainId);

  if (deployless) {
    try {
      const tokens = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [addresses, wstEth ?? zeroAddress],
      });

      let i = 0;
      return addresses.map((address) =>
        address === NATIVE_ADDRESS
          ? Token.native(chainId)
          : transformDeploylessTokenRead(chainId)(address, tokens[i++]!),
      );
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  return addresses.map((address) => fetchToken(address, client, parameters));
}
