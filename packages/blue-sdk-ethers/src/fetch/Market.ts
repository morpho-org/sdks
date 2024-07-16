import { Provider, ZeroAddress } from "ethers";
import { AdaptiveCurveIrm__factory, BlueOracle__factory, MorphoBlue__factory } from "ethers-types";
import { ViewOverrides } from "ethers-types/dist/common";

import { ChainId, ChainUtils, getChainAddresses, Market, MarketConfig, MarketId } from "@morpho-org/blue-sdk";

import "./MarketConfig";

export async function fetchMarket(
  id: MarketId,
  runner: { provider: Provider },
  { chainId, overrides = {} }: { chainId?: ChainId; overrides?: ViewOverrides } = {}
) {
  chainId = ChainUtils.parseSupportedChainId(chainId ?? (await runner.provider.getNetwork()).chainId);

  const config = await MarketConfig.fetch(id, runner, { chainId });

  return Market.fetchFromConfig(config, runner, { chainId, overrides });
}

export async function fetchMarketFromConfig(
  config: MarketConfig,
  runner: { provider: Provider },
  { chainId, overrides = {} }: { chainId?: ChainId; overrides?: ViewOverrides } = {}
) {
  chainId = ChainUtils.parseSupportedChainId(chainId ?? (await runner.provider.getNetwork()).chainId);

  const { morpho, adaptiveCurveIrm } = getChainAddresses(chainId);

  const [
    { totalSupplyAssets, totalSupplyShares, totalBorrowShares, totalBorrowAssets, lastUpdate, fee },
    price,
    rateAtTarget,
  ] = await Promise.all([
    MorphoBlue__factory.connect(morpho, runner).market(config.id, overrides),
    config.oracle !== ZeroAddress ? BlueOracle__factory.connect(config.oracle, runner).price(overrides) : 0n,
    config.irm === adaptiveCurveIrm
      ? await AdaptiveCurveIrm__factory.connect(config.irm, runner).rateAtTarget(config.id, overrides)
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
