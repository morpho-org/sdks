import {
  type MarketId,
  MarketParams,
  UnknownMarketParamsError,
  _try,
  getChainAddresses,
} from "@gfxlabs/blue-sdk";
import type { Client } from "viem";
import { getChainId } from "viem/actions";
import { blueAbi } from "../abis.js";
import type { FetchParameters } from "../types.js";
import { readContractRestructured } from "../utils.js";

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
      await readContractRestructured(client, {
        address: morpho,
        abi: blueAbi,
        functionName: "idToMarketParams",
        args: [id],
        // Always fetch at latest block because config is immutable.
        blockTag: "latest",
      }),
    );
  }

  return config;
}
