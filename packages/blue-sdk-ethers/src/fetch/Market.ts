import { type Provider, ZeroAddress } from "ethers";
import {
  AdaptiveCurveIrm__factory,
  BlueOracle__factory,
  MorphoBlue__factory,
} from "ethers-types";

import {
  ChainUtils,
  Market,
  type MarketConfig,
  type MarketId,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { FetchOptions } from "../types.js";
import { fetchMarketConfig } from "./MarketConfig.js";

export async function fetchMarket(
  id: MarketId,
  runner: { provider: Provider },
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const config = await fetchMarketConfig(id, runner, { chainId });

  return fetchMarketFromConfig(config, runner, { chainId, overrides });
}

export async function fetchMarketFromConfig(
  config: MarketConfig,
  runner: { provider: Provider },
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const { morpho, adaptiveCurveIrm } = getChainAddresses(chainId);

  const [
    {
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowShares,
      totalBorrowAssets,
      lastUpdate,
      fee,
    },
    price,
    rateAtTarget,
  ] = await Promise.all([
    MorphoBlue__factory.connect(
      morpho,
      // @ts-ignore incompatible commonjs type
      runner,
    ).market(config.id, overrides),
    config.oracle !== ZeroAddress
      ? BlueOracle__factory.connect(
          config.oracle,
          // @ts-ignore incompatible commonjs type
          runner,
        ).price(overrides)
      : 0n,
    config.irm === adaptiveCurveIrm
      ? await AdaptiveCurveIrm__factory.connect(
          config.irm,
          // @ts-ignore incompatible commonjs type
          runner,
        ).rateAtTarget(config.id, overrides)
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
