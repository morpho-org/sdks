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
  AccrualPosition,
  ChainId,
  ChainUtils,
  Market,
  MarketConfig,
  MarketId,
  Position,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { blueAbi } from "../abis";
import { ViewOverrides } from "../types";
import "./Market";

export async function fetchPosition<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  user: Address,
  marketId: MarketId,
  client: PublicClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >,
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await client.getChainId()),
  );

  const { morpho } = getChainAddresses(chainId);

  const [supplyShares, borrowShares, collateral] = await client.readContract({
    ...overrides,
    address: morpho as Address,
    abi: blueAbi,
    functionName: "position",
    args: [marketId, user],
  });

  return new Position({
    user,
    marketId,
    supplyShares,
    borrowShares,
    collateral,
  });
}

export async function fetchAccrualPosition<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  user: Address,
  marketId: MarketId,
  client: PublicClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await client.getChainId()),
  );

  const [position, market] = await Promise.all([
    await Position.fetch(user, marketId, client, options),
    await Market.fetch(marketId, client, options),
  ]);

  return new AccrualPosition(position, market);
}

export async function fetchAccrualPositionFromConfig<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  user: Address,
  config: MarketConfig,
  client: PublicClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await client.getChainId()),
  );

  const [position, market] = await Promise.all([
    await Position.fetch(user, config.id, client, options),
    await Market.fetchFromConfig(config, client, options),
  ]);

  return new AccrualPosition(position, market);
}

declare module "@morpho-org/blue-sdk" {
  namespace Position {
    let fetch: typeof fetchPosition;
  }

  namespace AccrualPosition {
    let fetch: typeof fetchAccrualPosition;
    let fetchFromConfig: typeof fetchAccrualPositionFromConfig;
  }
}

Position.fetch = fetchPosition;
AccrualPosition.fetch = fetchAccrualPosition;
AccrualPosition.fetchFromConfig = fetchAccrualPositionFromConfig;
