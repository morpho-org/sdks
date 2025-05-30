import type { Provider } from "ethers";
import { MorphoBlue__factory } from "ethers-types";

import {
  type Address,
  type ChainId,
  type MarketId,
  MarketParams,
  UnknownMarketParamsError,
  _try,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

export async function fetchMarketParams(
  id: MarketId,
  runner: { provider: Provider },
  { chainId }: { chainId?: ChainId } = {},
) {
  let config = _try(() => MarketParams.get(id), UnknownMarketParamsError);

  if (!config) {
    chainId ??= Number((await runner.provider.getNetwork()).chainId);

    const { morpho } = getChainAddresses(chainId);

    const marketParams = await MorphoBlue__factory.connect(
      morpho,
      runner,
    ).idToMarketParams(id, {
      // Always fetch at latest block because config is immutable.
      blockTag: "latest",
    });

    config = new MarketParams({
      lltv: marketParams.lltv,
      loanToken: marketParams.loanToken as Address,
      collateralToken: marketParams.collateralToken as Address,
      irm: marketParams.irm as Address,
      oracle: marketParams.oracle as Address,
    });
  }

  return config;
}
