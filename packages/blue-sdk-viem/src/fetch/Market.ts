import { type Client, zeroAddress } from "viem";

import {
  Market,
  type MarketId,
  MarketParams,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import type { DeploylessFetchParameters } from "../types";

import { adaptiveCurveIrmAbi, blueAbi, blueOracleAbi } from "../abis";
import { abi, code } from "../queries/GetMarket";
import { readContractRestructured } from "../utils";

export async function fetchMarket(
  id: MarketId,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { morpho, adaptiveCurveIrm } = getChainAddresses(parameters.chainId);

  if (deployless) {
    try {
      const {
        marketParams,
        market: {
          totalSupplyAssets,
          totalSupplyShares,
          totalBorrowAssets,
          totalBorrowShares,
          lastUpdate,
          fee,
        },
        hasPrice,
        price,
        rateAtTarget,
      } = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [morpho, id, adaptiveCurveIrm],
      });

      return new Market({
        params: new MarketParams(marketParams),
        totalSupplyAssets,
        totalBorrowAssets,
        totalSupplyShares,
        totalBorrowShares,
        lastUpdate,
        fee,
        price: hasPrice ? price : undefined,
        rateAtTarget:
          marketParams.irm === adaptiveCurveIrm ? rateAtTarget : undefined,
      });
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  const params = new MarketParams(
    await readContractRestructured(client, {
      ...parameters,
      address: morpho,
      abi: blueAbi,
      functionName: "idToMarketParams",
      args: [id],
    }),
  );

  const [market, price, rateAtTarget] = await Promise.all([
    readContractRestructured(client, {
      ...parameters,
      address: morpho,
      abi: blueAbi,
      functionName: "market",
      args: [params.id],
    }),
    params.oracle !== zeroAddress
      ? readContract(client, {
          ...parameters,
          address: params.oracle,
          abi: blueOracleAbi,
          functionName: "price",
        }).catch(() => undefined)
      : undefined,
    params.irm === adaptiveCurveIrm
      ? await readContract(client, {
          ...parameters,
          address: adaptiveCurveIrm,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [params.id],
        })
      : undefined,
  ]);

  return new Market({
    params,
    ...market,
    price,
    rateAtTarget,
  });
}
