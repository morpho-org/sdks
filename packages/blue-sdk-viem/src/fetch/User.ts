import type { Address, Client } from "viem";

import { User, getChainAddresses } from "@morpho-org/blue-sdk";
import { getChainId, readContract } from "viem/actions";
import { blueAbi } from "../abis";
import type { FetchParameters } from "../types";

export async function fetchUser(
  address: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const {
    morpho,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(parameters.chainId);

  const [isBundlerAuthorized, morphoNonce] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: morpho,
      abi: blueAbi,
      functionName: "isAuthorized",
      args: [address, generalAdapter1],
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
