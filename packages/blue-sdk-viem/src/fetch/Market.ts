import { Address, Client, zeroAddress } from "viem";

import {
  ChainUtils,
  Market,
  MarketConfig,
  MarketId,
  addresses,
} from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import { FetchOptions } from "../types";

import { adaptiveCurveIrmAbi, blueAbi, blueOracleAbi } from "../abis";
import { abi, code } from "../queries/GetMarket";

export async function fetchMarket(
  id: MarketId,
  client: Client,
  {
    chainId,
    overrides = {},
    deployless = true,
  }: FetchOptions & {
    deployless?: boolean;
  } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  const { morpho, adaptiveCurveIrm } = addresses[chainId];

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
        ...overrides,
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
      ...overrides,
      address: morpho as Address,
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
      ...overrides,
      address: morpho as Address,
      abi: blueAbi,
      functionName: "market",
      args: [config.id],
    }),
    config.oracle !== zeroAddress
      ? readContract(client, {
          ...overrides,
          address: config.oracle as Address,
          abi: blueOracleAbi,
          functionName: "price",
        })
      : 0n,
    config.irm === adaptiveCurveIrm
      ? await readContract(client, {
          ...overrides,
          address: adaptiveCurveIrm as Address,
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
