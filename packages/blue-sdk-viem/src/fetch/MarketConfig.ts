import {
  ChainUtils,
  MarketConfig,
  MarketId,
  UnknownMarketConfigError,
  _try,
  addresses,
} from "@morpho-org/blue-sdk";
import { Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { blueAbi } from "../abis";
import { FetchParameters } from "../types";

export async function fetchMarketConfig(
  id: MarketId,
  client: Client,
  { chainId }: Pick<FetchParameters, "chainId"> = {},
) {
  let config = _try(() => MarketConfig.get(id), UnknownMarketConfigError);

  if (!config) {
    chainId = ChainUtils.parseSupportedChainId(
      chainId ?? (await getChainId(client)),
    );

    const { morpho } = addresses[chainId];

    const [loanToken, collateralToken, oracle, irm, lltv] = await readContract(
      client,
      {
        address: morpho,
        abi: blueAbi,
        functionName: "idToMarketParams",
        args: [id],
        // Always fetch at latest block because config is immutable.
        blockTag: "latest",
      },
    );

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
