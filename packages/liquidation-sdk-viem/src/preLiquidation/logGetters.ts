import { type Address, ChainUtils, type MarketId } from "@morpho-org/blue-sdk";
import { addresses } from "@morpho-org/blue-sdk";
import type { Account, Chain, Client, Transport } from "viem";
import { getBlockNumber, getLogs } from "viem/actions";
import { preLiquidationFactoryConfigs } from "../addresses";
import type { PreLiquidation } from "./types";

export async function preLiquidationLogs<chain extends Chain = Chain>(
  client: Client<Transport, chain, Account>,
): Promise<PreLiquidation[]> {
  const chainId = ChainUtils.parseSupportedChainId(client.chain.id);

  try {
    const head = await getBlockNumber(client);

    const logs = await getLogs(client, {
      address: preLiquidationFactoryConfigs[chainId].address,
      fromBlock: preLiquidationFactoryConfigs[chainId].deploymentBlock,
      toBlock: BigInt(head),
      event: {
        type: "event",
        name: "CreatePreLiquidation",
        inputs: [
          {
            name: "preLiquidation",
            type: "address",
            indexed: true,
            internalType: "address",
          },
          {
            name: "id",
            type: "bytes32",
            indexed: false,
            internalType: "Id",
          },
          {
            name: "preLiquidationParams",
            type: "tuple",
            indexed: false,
            internalType: "struct PreLiquidationParams",
            components: [
              { name: "preLltv", type: "uint256", internalType: "uint256" },
              { name: "preLCF1", type: "uint256", internalType: "uint256" },
              { name: "preLCF2", type: "uint256", internalType: "uint256" },
              { name: "preLIF1", type: "uint256", internalType: "uint256" },
              { name: "preLIF2", type: "uint256", internalType: "uint256" },
              {
                name: "preLiquidationOracle",
                type: "address",
                internalType: "address",
              },
            ],
          },
        ],
      },
    });

    return logs.map((log) => {
      return {
        marketId: log.args.id! as MarketId,
        address: log.args.preLiquidation! as Address,
        preLiquidationParams: formatPreLiquidationParams(
          log.args.preLiquidationParams!,
        ),
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
  const factoryDeploymentBlock = 21272611;

  try {
    const head = await getBlockNumber(client);

    const logs = await getLogs(client, {
      address: addresses[chainId].morpho,
      fromBlock: BigInt(factoryDeploymentBlock),
      toBlock: BigInt(head),
      event: {
        type: "event",
        name: "SetAuthorization",
        inputs: [
          {
            name: "caller",
            type: "address",
            indexed: true,
            internalType: "address",
          },
          {
            name: "authorizer",
            type: "address",
            indexed: true,
            internalType: "address",
          },
          {
            name: "authorized",
            type: "address",
            indexed: true,
            internalType: "address",
          },
          {
            name: "newIsAuthorized",
            type: "bool",
            indexed: false,
            internalType: "bool",
          },
        ],
        anonymous: false,
      },
      args: {
        authorized: preLiquidation.address,
      },
    });

    return logs
      .filter((log) => log.args.newIsAuthorized! === true)
      .map((log) => log.args.authorizer! as Address);
  } catch (e) {
    console.error(e);
    return [];
  }
}

function formatPreLiquidationParams(preLiquidiationParams: {
  preLltv: bigint;
  preLCF1: bigint;
  preLCF2: bigint;
  preLIF1: bigint;
  preLIF2: bigint;
  preLiquidationOracle: `0x${string}`;
}) {
  return {
    preLltv: preLiquidiationParams.preLltv,
    preLCF1: preLiquidiationParams.preLCF1,
    preLCF2: preLiquidiationParams.preLCF2,
    preLIF1: preLiquidiationParams.preLIF1,
    preLIF2: preLiquidiationParams.preLIF2,
    preLiquidationOracle: preLiquidiationParams.preLiquidationOracle as Address,
  };
}
