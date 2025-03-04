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
import { blueAbi, preLiquidationAbi } from "../abis";
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

export async function fetchPreLiquidationParams(
  preLiquidation: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
): Promise<PreLiquidationParams> {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );
  const { preLltv, preLCF1, preLCF2, preLIF1, preLIF2, preLiquidationOracle } =
    await readContract(client, {
      ...parameters,
      address: preLiquidation,
      abi: preLiquidationAbi,
      functionName: "preLiquidationParams",
    });

  return { preLltv, preLCF1, preLCF2, preLIF1, preLIF2, preLiquidationOracle };
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
  const [position, market, preLiquidationParams, preLiquidationAuthorization] =
    await Promise.all([
      await fetchPosition(user, marketId, client, parameters),
      await fetchMarket(marketId, client, parameters),
      await fetchPreLiquidationParams(preLiquidation, client, parameters),
      await fetchPreLiquidationAuthorization(user, preLiquidation, client),
    ]);

  return new PreLiquidatablePosition(
    {
      ...position,
      preLiquidationParams,
      preLiquidation,
      preLiquidationAuthorization,
    },
    market,
  );
}
