import type { Provider } from "ethers";
import { MorphoBlue__factory } from "ethers-types";

import {
  AccrualPosition,
  type Address,
  type MarketId,
  type MarketParams,
  Position,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { FetchOptions } from "../types";
import { fetchMarket, fetchMarketFromConfig } from "./Market";

export async function fetchPosition(
  user: Address,
  marketId: MarketId,
  runner: { provider: Provider },
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId ??= Number((await runner.provider.getNetwork()).chainId);

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
  options: FetchOptions = {},
) {
  options.chainId ??= Number((await runner.provider.getNetwork()).chainId);

  const [position, market] = await Promise.all([
    await fetchPosition(user, marketId, runner, options),
    await fetchMarket(marketId, runner, options),
  ]);

  return new AccrualPosition(position, market);
}

export async function fetchAccrualPositionFromConfig(
  user: Address,
  config: MarketParams,
  runner: { provider: Provider },
  options: FetchOptions = {},
) {
  options.chainId ??= Number((await runner.provider.getNetwork()).chainId);

  const [position, market] = await Promise.all([
    await fetchPosition(user, config.id, runner, options),
    await fetchMarketFromConfig(config, runner, options),
  ]);

  return new AccrualPosition(position, market);
}
