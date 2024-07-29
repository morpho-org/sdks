import {
  ChainId,
  ChainUtils,
  MarketConfig,
  MarketId,
  UnknownMarketConfigError,
  _try,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { blueAbi } from "../abis";

export async function fetchMarketConfig(
  id: MarketId,
  client: Client,
  { chainId }: { chainId?: ChainId } = {},
) {
  let config = _try(() => MarketConfig.get(id), UnknownMarketConfigError);

  if (!config) {
    chainId = ChainUtils.parseSupportedChainId(
      chainId ?? (await getChainId(client)),
    );

    const { morpho } = getChainAddresses(chainId);

    const [loanToken, collateralToken, oracle, irm, lltv] =
      // Always fetch at latest block because config is immutable.
      await readContract(client, {
        address: morpho as Address,
        abi: blueAbi,
        functionName: "idToMarketParams",
        args: [id],
      });

    config = new MarketConfig({
      loanToken,
      collateralToken,
      oracle,
      irm,
      lltv,
    });
  }

  return config;
}
