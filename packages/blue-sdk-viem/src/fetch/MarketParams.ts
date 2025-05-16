import {
  type MarketId,
  MarketParams,
  UnknownMarketParamsError,
  _try,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { blueAbi } from "../abis";
import type { FetchParameters } from "../types";
import { restructure } from "../utils";

export async function fetchMarketParams(
  id: MarketId,
  client: Client,
  { chainId }: Pick<FetchParameters, "chainId"> = {},
) {
  let config = _try(() => MarketParams.get(id), UnknownMarketParamsError);

  if (!config) {
    chainId ??= await getChainId(client);

    const { morpho } = getChainAddresses(chainId);

    config = new MarketParams(
      restructure(
        await readContract(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "idToMarketParams",
          args: [id],
          // Always fetch at latest block because config is immutable.
          blockTag: "latest",
        }),
        { abi: blueAbi, name: "idToMarketParams", args: ["0x"] },
      ),
    );
  }

  return config;
}
