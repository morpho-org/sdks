import {
  type IMarketParams,
  type MarketId,
  MarketIdMismatchError,
  MarketParams,
  MarketUtils,
} from "@morpho-org/blue-sdk";

/** @internal Validates an RPC market-parameter tuple before caching it. */
export function parseMarketParams(
  expectedMarketId: MarketId,
  params: IMarketParams,
): MarketParams {
  const marketId = MarketUtils.getMarketId(params);
  if (marketId.toLowerCase() !== expectedMarketId.toLowerCase())
    throw new MarketIdMismatchError(marketId, expectedMarketId);

  return new MarketParams(params);
}
