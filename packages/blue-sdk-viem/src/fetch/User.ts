import { Address, Client } from "viem";

import { ChainUtils, User, getChainAddresses } from "@morpho-org/blue-sdk";
import { getChainId, readContract } from "viem/actions";
import { blueAbi } from "../abis";
import { FetchOptions } from "../types";

export async function fetchUser(
  address: Address,
  client: Client,
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  const { morpho, bundler } = getChainAddresses(chainId);

  const [isBundlerAuthorized, morphoNonce] = await Promise.all([
    readContract(client, {
      ...overrides,
      address: morpho as Address,
      abi: blueAbi,
      functionName: "isAuthorized",
      args: [address, bundler as Address],
    }),
    readContract(client, {
      ...overrides,
      address: morpho as Address,
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
