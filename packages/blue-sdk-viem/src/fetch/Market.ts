import { Address, Client, zeroAddress } from "viem";

import {
  ChainId,
  ChainUtils,
  Market,
  MarketConfig,
  MarketId,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import { adaptiveCurveIrmAbi, blueAbi, blueOracleAbi } from "../abis";
import { ViewOverrides } from "../types";
import { fetchMarketConfig } from "./MarketConfig";

export async function fetchMarket(
  id: MarketId,
  client: Client,
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  const config = await fetchMarketConfig(id, client, { chainId });

  return fetchMarketFromConfig(config, client, { chainId, overrides });
}

export async function fetchMarketFromConfig(
  config: MarketConfig,
  client: Client,
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  const { morpho, adaptiveCurveIrm } = getChainAddresses(chainId);

  const [
    [
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    ],
    price,
    rateAtTarget,
  ] = await Promise.all([
    readContract(client, {
      ...overrides,
      address: morpho as Address,
      abi: blueAbi,
      functionName: "market",
      args: [config.id],
    }),
    config.oracle !== zeroAddress
      ? readContract(client, {
          ...overrides,
          address: config.oracle as Address,
          abi: blueOracleAbi,
          functionName: "price",
        })
      : 0n,
    config.irm === adaptiveCurveIrm
      ? await readContract(client, {
          ...overrides,
          address: adaptiveCurveIrm as Address,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [config.id],
        })
      : undefined,
  ]);

  return new Market({
    config,
    totalSupplyAssets,
    totalBorrowAssets,
    totalSupplyShares,
    totalBorrowShares,
    lastUpdate,
    fee,
    price,
    rateAtTarget,
  });
}
