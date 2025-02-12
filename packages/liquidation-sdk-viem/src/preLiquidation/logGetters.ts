import { type Address, ChainUtils, type MarketId } from "@morpho-org/blue-sdk";
import { addresses } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import type { Account, Chain, Client, Transport } from "viem";
import { getBlockNumber, getContractEvents } from "viem/actions";
import { preLiquidationFactoryAbi } from "../abis";
import { preLiquidationFactoryConfigs } from "../addresses";
import type { PreLiquidation, PreLiquidationParams } from "./types";

export async function preLiquidationLogs<chain extends Chain = Chain>(
  client: Client<Transport, chain, Account>,
): Promise<PreLiquidation[]> {
  const chainId = ChainUtils.parseSupportedChainId(client.chain.id);

  try {
    const head = await getBlockNumber(client);
    const intervals = sliceBlockInterval(
      preLiquidationFactoryConfigs[chainId].startBlock,
      BigInt(head),
    );

    const logs = (
      await Promise.all(
        intervals.map((interval) =>
          getContractEvents(client, {
            address: preLiquidationFactoryConfigs[chainId].address,
            fromBlock: interval.startBlock,
            toBlock: interval.endBlock,
            abi: preLiquidationFactoryAbi,
            eventName: "CreatePreLiquidation",
            strict: true,
          }),
        ),
      )
    ).flat();

    return logs.map((log) => {
      return {
        marketId: log.args.id as MarketId,
        address: log.args.preLiquidation as Address,
        preLiquidationParams: log.args
          .preLiquidationParams as PreLiquidationParams,
      };
    });
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function authorizationLogs<chain extends Chain = Chain>(
  client: Client<Transport, chain>,
  preLiquidation: PreLiquidation,
) {
  const chainId = ChainUtils.parseSupportedChainId(client.chain.id);

  try {
    const head = await getBlockNumber(client);

    const intervals = sliceBlockInterval(
      preLiquidationFactoryConfigs[chainId].startBlock,
      BigInt(head),
    );

    const logs = (
      await Promise.all(
        intervals.map((interval) =>
          getContractEvents(client, {
            address: addresses[chainId].morpho,
            fromBlock: interval.startBlock,
            toBlock: interval.endBlock,
            abi: blueAbi,
            eventName: "SetAuthorization",
            args: {
              authorized: preLiquidation.address,
            },
            strict: true,
          }),
        ),
      )
    ).flat();

    return logs
      .filter((log) => log.args.newIsAuthorized === true)
      .map((log) => log.args.authorizer as Address);
  } catch (e) {
    console.error(e);
    return [];
  }
}

function sliceBlockInterval(
  startBlock: bigint,
  endBlock: bigint,
  step: bigint = BigInt(100000),
) {
  const intervals = [];
  for (
    let currentBlock = startBlock;
    currentBlock < endBlock;
    currentBlock += step
  ) {
    intervals.push({
      startBlock: currentBlock,
      endBlock: currentBlock + step < endBlock ? currentBlock + step : endBlock,
    });
  }
  return intervals;
}
