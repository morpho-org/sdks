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
  User,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "../abis";
import { ViewOverrides } from "../types";

export async function fetchUser<
  transport extends Transport,
  chain extends Chain | undefined,
  account extends Account | undefined,
  rpcSchema extends RpcSchema | undefined,
>(
  address: Address,
  client: PublicClient<transport, chain, ParseAccount<account>, rpcSchema>,
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await client.getChainId()),
  );

  const { morpho, bundler } = getChainAddresses(chainId);

  const [isBundlerAuthorized, morphoNonce] = await Promise.all([
    client.readContract({
      ...overrides,
      address: morpho as Address,
      abi: blueAbi,
      functionName: "isAuthorized",
      args: [address, bundler as Address],
    }),
    client.readContract({
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
