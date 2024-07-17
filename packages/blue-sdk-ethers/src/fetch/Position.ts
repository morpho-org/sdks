import { Provider } from "ethers";
import { MorphoBlue__factory } from "ethers-types";
import { ViewOverrides } from "ethers-types/dist/common";

import {
  AccrualPosition,
  Address,
  ChainId,
  ChainUtils,
  MarketConfig,
  MarketId,
  Position,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { fetchMarket, fetchMarketFromConfig } from "./Market";

export async function fetchPosition(
  user: Address,
  marketId: MarketId,
  runner: { provider: Provider },
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const { morpho } = getChainAddresses(chainId);

  const { supplyShares, borrowShares, collateral } =
    await MorphoBlue__factory.connect(morpho, runner).position(
      marketId,
      user,
      overrides,
    );

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
  runner: { provider: Provider },
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const [position, market] = await Promise.all([
    await fetchPosition(user, marketId, runner, options),
    await fetchMarket(marketId, runner, options),
  ]);

  return new AccrualPosition(position, market);
}

export async function fetchAccrualPositionFromConfig(
  user: Address,
  config: MarketConfig,
  runner: { provider: Provider },
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const [position, market] = await Promise.all([
    await fetchPosition(user, config.id, runner, options),
    await fetchMarketFromConfig(config, runner, options),
  ]);

  return new AccrualPosition(position, market);
}
