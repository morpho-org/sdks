import type { PartialBlueApiToken } from "@morpho-org/blue-api-sdk";
import { ChainUtils, type MarketId } from "@morpho-org/blue-sdk";
import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import { apiSdk } from "src/api";
import {
  type PreLiquidation,
  PreLiquidationPosition,
} from "src/preLiquidation/types";
import type { Account, Chain, Client, Transport } from "viem";
import { authorizationLogs, preLiquidationLogs } from "./logGetters";

export async function getPreLiquidablePositions(
  client: Client<Transport, Chain, Account>,
  whitelistedMarkets: MarketId[],
) {
  const chainId = ChainUtils.parseSupportedChainId(client.chain.id);

  const preLiquidations = (await preLiquidationLogs(client)).filter(
    (preLiquidation) => whitelistedMarkets.includes(preLiquidation.marketId),
  );

  const preLiquidationPositions = await Promise.all(
    preLiquidations.map(async (preLiquidation) => {
      const {
        markets: { items: market },
      } = await apiSdk.getMarketAssets({
        chainId,
        marketId: preLiquidation.marketId,
      });

      const loanAsset =
        market !== null ? market[0]?.market.loanAsset : undefined;
      const collateralAsset =
        market !== null ? market[0]?.market.collateralAsset : undefined;

      if (
        loanAsset === undefined ||
        collateralAsset === undefined ||
        collateralAsset === null
      )
        return;

      return {
        preLiquidation,
        borrowers: await authorizationLogs(client, preLiquidation),
        loanAsset,
        collateralAsset,
      };
    }),
  );

  const preLiquidablePositions = await Promise.all(
    preLiquidationPositions
      .filter((position) => position !== undefined)
      .map(async (preLiquidationPosition) => {
        return await Promise.all(
          preLiquidationPosition.borrowers.map(async (borrower) => {
            return await getPreLiquidablePosition(
              client,
              preLiquidationPosition.preLiquidation,
              borrower,
              preLiquidationPosition.collateralAsset,
              preLiquidationPosition.loanAsset,
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
  collateralAsset: PartialBlueApiToken,
  loanAsset: PartialBlueApiToken,
) {
  const chainId = ChainUtils.parseSupportedChainId(client.chain.id);
  const accrualPosition = await fetchAccrualPosition(
    borrower as `0x${string}`,
    String(preLiquidation.marketId) as MarketId,
    client,
    { chainId },
  );

  const accruedPosition = accrualPosition.accrueInterest(Time.timestamp());

  return new PreLiquidationPosition(
    accruedPosition,
    collateralAsset,
    loanAsset,
    preLiquidation,
  );
}
