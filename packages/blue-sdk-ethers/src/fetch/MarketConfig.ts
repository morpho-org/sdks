import { Provider } from "ethers";
import { MorphoBlue__factory } from "ethers-types";

import {
  ChainId,
  ChainUtils,
  MarketConfig,
  MarketId,
  UnknownMarketConfigError,
  _try,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

export async function fetchMarketConfig(
  id: MarketId,
  runner: { provider: Provider },
  { chainId }: { chainId?: ChainId } = {},
) {
  let config = _try(() => MarketConfig.get(id), UnknownMarketConfigError);

  if (!config) {
    chainId = ChainUtils.parseSupportedChainId(
      chainId ?? (await runner.provider.getNetwork()).chainId,
    );

    const { morpho } = getChainAddresses(chainId);

    config = new MarketConfig(
      // Always fetch at latest block because config is immutable.
      await MorphoBlue__factory.connect(morpho, runner).idToMarketParams(id),
    );
  }

  return config;
}
