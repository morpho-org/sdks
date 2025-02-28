import { type Provider, ZeroAddress } from "ethers";
import {
  AdaptiveCurveIrm__factory,
  BlueOracle__factory,
  MorphoBlue__factory,
} from "ethers-types";

import {
  Market,
  type MarketId,
  type MarketParams,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { FetchOptions } from "../types";
import { fetchMarketParams } from "./MarketParams";

export async function fetchMarket(
  id: MarketId,
  runner: { provider: Provider },
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId ??= Number((await runner.provider.getNetwork()).chainId);

  const config = await fetchMarketParams(id, runner, { chainId });

  return fetchMarketFromConfig(config, runner, { chainId, overrides });
}

export async function fetchMarketFromConfig(
  params: MarketParams,
  runner: { provider: Provider },
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId ??= Number((await runner.provider.getNetwork()).chainId);

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
    MorphoBlue__factory.connect(morpho, runner).market(params.id, overrides),
    params.oracle !== ZeroAddress
      ? BlueOracle__factory.connect(params.oracle, runner)
          .price(overrides)
          .catch(() => undefined)
      : undefined,
    params.irm === adaptiveCurveIrm
      ? await AdaptiveCurveIrm__factory.connect(
          params.irm,
          runner,
        ).rateAtTarget(params.id, overrides)
      : undefined,
  ]);

  return new Market({
    params,
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
