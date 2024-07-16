import {
  Account,
  Address,
  Chain,
  ParseAccount,
  PublicClient,
  RpcSchema,
  Transport,
  zeroAddress,
} from "viem";

import {
  ChainId,
  ChainUtils,
  Market,
  MarketConfig,
  MarketId,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import "./MarketConfig";
import { adaptiveCurveIrmAbi, blueAbi, blueOracleAbi } from "../abis";
import { ViewOverrides } from "../types";

export async function fetchMarket<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  id: MarketId,
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

  const config = await MarketConfig.fetch(id, client, { chainId });

  return Market.fetchFromConfig(config, client, { chainId, overrides });
}

export async function fetchMarketFromConfig<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  config: MarketConfig,
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

  const { morpho, adaptiveCurveIrm } = getChainAddresses(chainId);

  const [
    [
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowShares,
      totalBorrowAssets,
      lastUpdate,
      fee,
    ],
    price,
    rateAtTarget,
  ] = await Promise.all([
    client.readContract({
      ...overrides,
      address: morpho as Address,
      abi: blueAbi,
      functionName: "market",
      args: [config.id],
    }),
    config.oracle !== zeroAddress
      ? client.readContract({
          ...overrides,
          address: config.oracle as Address,
          abi: blueOracleAbi,
          functionName: "price",
        })
      : 0n,
    config.irm === adaptiveCurveIrm
      ? await client.readContract({
          ...overrides,
          address: morpho as Address,
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

declare module "@morpho-org/blue-sdk" {
  namespace Market {
    let fetch: typeof fetchMarket;
    let fetchFromConfig: typeof fetchMarketFromConfig;
  }
}

Market.fetch = fetchMarket;
Market.fetchFromConfig = fetchMarketFromConfig;
