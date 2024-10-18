import type { Address, Client } from "viem";

import { ChainUtils, User, addresses } from "@morpho-org/blue-sdk";
import { getChainId, readContract } from "viem/actions";
import { blueAbi } from "../abis.js";
import type { FetchParameters } from "../types.js";

export async function fetchUser(
  address: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  const { morpho, bundler } = addresses[parameters.chainId];

  const [isBundlerAuthorized, morphoNonce] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: morpho,
      abi: blueAbi,
      functionName: "isAuthorized",
      args: [address, bundler],
    }),
    readContract(client, {
      ...parameters,
      address: morpho,
      abi: blueAbi,
      functionName: "nonce",
      args: [address],
    }),
  ]);

  return new User({
    address,
    isBundlerAuthorized,
    morphoNonce,
  });
}
