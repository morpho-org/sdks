import {
  AccrualPosition,
  ChainUtils,
  type MarketId,
  Position,
  PreLiquidatablePosition,
  type PreLiquidationParams,
  addresses,
} from "@morpho-org/blue-sdk";

import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { blueAbi, preLiquidationAbi, preLiquidationFactoryAbi } from "../abis";
import type { DeploylessFetchParameters, FetchParameters } from "../types";
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

export async function fetchPreLiquidationParameters(
  preLiquidation: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );
  const isPreLiquidation = await readContract(client, {
    ...parameters,
    address: addresses[parameters.chainId].preLiquidationFactory,
    abi: preLiquidationFactoryAbi,
    functionName: "isPreLiquidation",
    args: [preLiquidation],
  });

  if (!isPreLiquidation) {
    return undefined;
  }

  const preLiquidationParameters = await readContract(client, {
    ...parameters,
    address: preLiquidation,
    abi: preLiquidationAbi,
    functionName: "preLiquidationParams",
    args: [],
  });

  return preLiquidationParameters as PreLiquidationParams;
}

async function fetchPreLiquidationAuthorization(
  user: Address,
  preLiquidation: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );
  const { morpho } = addresses[parameters.chainId];
  return await readContract(client, {
    ...parameters,
    address: morpho,
    abi: blueAbi,
    functionName: "isAuthorized",
    args: [user, preLiquidation],
  });
}

export async function fetchAccrualPosition(
  user: Address,
  marketId: MarketId,
  client: Client,
  parameters: DeploylessFetchParameters = {},
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

export async function fetchPreLiquidatablePosition(
  user: Address,
  marketId: MarketId,
  preLiquidation: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );
  const [position, market, preLiquidationParams, isPreLiquidationAuthorized] =
    await Promise.all([
      await fetchPosition(user, marketId, client, parameters),
      await fetchMarket(marketId, client, parameters),
      await fetchPreLiquidationParameters(preLiquidation, client, parameters),
      await fetchPreLiquidationAuthorization(user, preLiquidation, client),
    ]);

  if (!preLiquidationParams || !isPreLiquidationAuthorized) {
    return new AccrualPosition(position, market);
  }

  return new PreLiquidatablePosition(
    position,
    market,
    preLiquidationParams,
    preLiquidation,
  );
}
