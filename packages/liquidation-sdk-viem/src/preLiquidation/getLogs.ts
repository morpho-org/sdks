import { ChainUtils } from "@morpho-org/blue-sdk";
import { addresses } from "@morpho-org/blue-sdk";
import { mainnetAddresses } from "src/addresses";
import type {
  Account,
  Chain,
  Client,
  PublicActions,
  PublicRpcSchema,
  Transport,
  WalletActions,
  WalletRpcSchema,
} from "viem";
import type { PreLiquidation } from "../helpers/types";

export async function preLiquidationLogs<chain extends Chain = Chain>(
  client: Client<
    Transport,
    chain,
    Account,
    PublicRpcSchema | WalletRpcSchema,
    PublicActions<Transport, chain, Account> & WalletActions<chain, Account>
  >,
) {
  const chainId = ChainUtils.parseSupportedChainId(client.chain.id);
  const factoryDeploymentBlock = 21272611;

  try {
    const head = await client.getBlockNumber();

    const logs = await client.getLogs({
      address:
        chainId === 1 ? mainnetAddresses.preLiquidationFactory : undefined,
      fromBlock: BigInt(factoryDeploymentBlock),
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
        marketId: log.args.id!,
        preLiquidationAddress: log.args.preLiquidation!,
        preLiquidationParams: log.args.preLiquidationParams!,
      };
    });
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function authorizationLogs<chain extends Chain = Chain>(
  client: Client<
    Transport,
    chain,
    Account,
    PublicRpcSchema | WalletRpcSchema,
    PublicActions<Transport, chain, Account> & WalletActions<chain, Account>
  >,
  preLiquidation: PreLiquidation,
) {
  const chainId = ChainUtils.parseSupportedChainId(client.chain.id);
  const factoryDeploymentBlock = 21272611;

  try {
    const head = await client.getBlockNumber();

    const logs = await client.getLogs({
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
      .map((log) => log.args.authorizer!);
  } catch (e) {
    console.error(e);
    return [];
  }
}
