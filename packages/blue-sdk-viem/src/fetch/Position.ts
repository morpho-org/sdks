import { Address, Client } from "viem";

import {
  AccrualPosition,
  ChainId,
  ChainUtils,
  MarketConfig,
  MarketId,
  Position,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import { blueAbi } from "../abis";
import { ViewOverrides } from "../types";
import { fetchMarket, fetchMarketFromConfig } from "./Market";

export async function fetchPosition(
  user: Address,
  marketId: MarketId,
  client: Client,
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  const { morpho } = getChainAddresses(chainId);

  const [supplyShares, borrowShares, collateral] = await readContract(client, {
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

export async function fetchAccrualPosition(
  user: Address,
  marketId: MarketId,
  client: Client,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await getChainId(client)),
  );

  const [position, market] = await Promise.all([
    await fetchPosition(user, marketId, client, options),
    await fetchMarket(marketId, client, options),
  ]);

  return new AccrualPosition(position, market);
}

export async function fetchAccrualPositionFromConfig(
  user: Address,
  config: MarketConfig,
  client: Client,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await getChainId(client)),
  );

  const [position, market] = await Promise.all([
    await fetchPosition(user, config.id, client, options),
    await fetchMarketFromConfig(config, client, options),
  ]);

  return new AccrualPosition(position, market);
}
