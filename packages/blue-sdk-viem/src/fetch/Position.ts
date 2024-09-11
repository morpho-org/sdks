import {
  AccrualPosition,
  ChainUtils,
  MarketId,
  Position,
  addresses,
} from "@morpho-org/blue-sdk";

import { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { blueAbi } from "../abis";
import { FetchParameters } from "../types";
import { fetchMarket } from "./Market";

export async function fetchPosition(
  user: Address,
  marketId: MarketId,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );
  const { morpho } = addresses[parameters.chainId];
  const [supplyShares, borrowShares, collateral] = await readContract(client, {
    ...parameters,
    address: morpho,
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
  parameters: FetchParameters & {
    deployless?: boolean;
  } = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );
  const [position, market] = await Promise.all([
    await fetchPosition(user, marketId, client, parameters),
    await fetchMarket(marketId, client, parameters),
  ]);

  return new AccrualPosition(position, market);
}
