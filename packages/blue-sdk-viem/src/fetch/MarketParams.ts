import {
  ChainUtils,
  type MarketId,
  MarketParams,
  UnknownMarketParamsError,
  _try,
  addresses,
} from "@morpho-org/blue-sdk";
import type { Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { blueAbi } from "../abis.js";
import type { FetchParameters } from "../types.js";

export async function fetchMarketParams(
  id: MarketId,
  client: Client,
  { chainId }: Pick<FetchParameters, "chainId"> = {},
) {
  let config = _try(() => MarketParams.get(id), UnknownMarketParamsError);

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

    config = new MarketParams({
      loanToken,
      collateralToken,
      oracle,
      irm,
      lltv,
    });
  }

  return config;
}
