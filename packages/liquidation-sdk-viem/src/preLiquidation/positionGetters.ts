import { ChainUtils, type MarketId } from "@morpho-org/blue-sdk";
import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import {
  type PreLiquidation,
  PreLiquidationPosition,
} from "src/preLiquidation/types";
import type { Account, Chain, Client, Transport } from "viem";
import { authorizationLogs, preLiquidationLogs } from "./getLogs";

export async function getPreLiquidablePositions(
  client: Client<Transport, Chain, Account>,
  whitelistedMarkets: MarketId[],
) {
  const preLiquidations = (await preLiquidationLogs(client)).filter(
    (preLiquidation) => whitelistedMarkets.includes(preLiquidation.marketId),
  );

  const preLiquidationPositions = await Promise.all(
    preLiquidations.map(async (preLiquidation) => {
      return {
        preLiquidation,
        borrowers: await authorizationLogs(client, preLiquidation),
      };
    }),
  );

  const preLiquidablePositions = await Promise.all(
    preLiquidationPositions.map(async (preLiquidationPosition) => {
      return await Promise.all(
        preLiquidationPosition.borrowers.map(async (borrower) => {
          return await getPreLiquidablePosition(
            client,
            preLiquidationPosition.preLiquidation,
            borrower,
          );
        }),
      );
    }),
  );

  return preLiquidablePositions
    .flat()
    .filter((position) => position.preSeizableCollateral !== undefined);
}

async function getPreLiquidablePosition(
  client: Client<Transport, Chain>,
  preLiquidation: PreLiquidation,
  borrower: string,
) {
  const chainId = ChainUtils.parseSupportedChainId(client.chain.id);
  const accrualPosition = await fetchAccrualPosition(
    borrower as `0x${string}`,
    String(preLiquidation.marketId) as MarketId,
    client,
    { chainId },
  );

  const accruedPosition = accrualPosition.accrueInterest(Time.timestamp());

  return new PreLiquidationPosition(accruedPosition, preLiquidation);
}
