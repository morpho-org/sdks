import type { Client } from "viem";

import { type MarketId, getChainAddresses } from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import type { DeploylessFetchParameters } from "../types";

import { abi, code } from "../queries/GetMarkets";
import { fetchMarket, transformDeploylessMarketRead } from "./Market";

export async function fetchMarkets(
  ids: MarketId[],
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { morpho, adaptiveCurveIrm } = getChainAddresses(parameters.chainId);

  if (deployless) {
    try {
      const markets = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [morpho, ids, adaptiveCurveIrm],
      });

      return markets.map(transformDeploylessMarketRead(adaptiveCurveIrm));
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  return Promise.all(ids.map((id) => fetchMarket(id, client, parameters)));
}
