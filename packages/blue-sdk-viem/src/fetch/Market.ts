import { type Client, zeroAddress } from "viem";

import {
  ChainUtils,
  Market,
  MarketConfig,
  type MarketId,
  addresses,
} from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import type { DeploylessFetchParameters } from "../types.js";

import { adaptiveCurveIrmAbi, blueAbi, blueOracleAbi } from "../abis.js";
import { abi, code } from "../queries/GetMarket.js";

export async function fetchMarket(
  id: MarketId,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  const { morpho, adaptiveCurveIrm } = addresses[parameters.chainId];

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
        config: new MarketConfig(marketParams),
        totalSupplyAssets,
        totalBorrowAssets,
        totalSupplyShares,
        totalBorrowShares,
        lastUpdate,
        fee,
        price,
        rateAtTarget:
          marketParams.irm === adaptiveCurveIrm ? rateAtTarget : undefined,
      });
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  const [loanToken, collateralToken, oracle, irm, lltv] = await readContract(
    client,
    {
      ...parameters,
      address: morpho,
      abi: blueAbi,
      functionName: "idToMarketParams",
      args: [id],
    },
  );

  const config = new MarketConfig({
    loanToken,
    collateralToken,
    oracle,
    irm,
    lltv,
  });

  const [
    [
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    ],
    price,
    rateAtTarget,
  ] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: morpho,
      abi: blueAbi,
      functionName: "market",
      args: [config.id],
    }),
    config.oracle !== zeroAddress
      ? readContract(client, {
          ...parameters,
          address: config.oracle,
          abi: blueOracleAbi,
          functionName: "price",
        })
      : 0n,
    config.irm === adaptiveCurveIrm
      ? await readContract(client, {
          ...parameters,
          address: adaptiveCurveIrm,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [config.id],
        })
      : undefined,
  ]);
  return new Market({
    config,
    totalSupplyAssets,
    totalBorrowAssets,
    totalSupplyShares,
    totalBorrowShares,
    lastUpdate,
    fee,
    price,
    rateAtTarget,
  });
}
