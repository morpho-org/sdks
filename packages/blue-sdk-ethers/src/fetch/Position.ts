import { Provider } from "ethers";
import { MorphoBlue__factory } from "ethers-types";
import { ViewOverrides } from "ethers-types/dist/common";

import {
  AccrualPosition,
  Address,
  ChainId,
  ChainUtils,
  Market,
  MarketConfig,
  MarketId,
  Position,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import "./Market";

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
    await Position.fetch(user, marketId, runner, options),
    await Market.fetch(marketId, runner, options),
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
    await Position.fetch(user, config.id, runner, options),
    await Market.fetchFromConfig(config, runner, options),
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
