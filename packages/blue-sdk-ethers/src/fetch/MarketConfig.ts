import { Provider } from "ethers";
import { MorphoBlue__factory } from "ethers-types";

import {
  Address,
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

    const marketParams = await MorphoBlue__factory.connect(
      morpho,
      runner,
    ).idToMarketParams(id, {
      // Always fetch at latest block because config is immutable.
      blockTag: "latest",
    });

    config = new MarketConfig({
      lltv: marketParams.lltv,
      loanToken: marketParams.loanToken as Address,
      collateralToken: marketParams.collateralToken as Address,
      irm: marketParams.irm as Address,
      oracle: marketParams.oracle as Address,
    });
  }

  return config;
}
