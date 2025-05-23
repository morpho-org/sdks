import type { PartialApiToken } from "@morpho-org/blue-api-sdk";
import type { MarketId } from "@morpho-org/blue-sdk";
import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import type { Account, Chain, Client, Transport } from "viem";
import { apiSdk } from "../api";
import {
  type PreLiquidation,
  type PreLiquidationData,
  PreLiquidationPosition,
} from "./types";

export async function getPreLiquidablePositions(
  client: Client<Transport, Chain, Account>,
  whitelistedMarkets: MarketId[],
) {
  const chainId = client.chain.id;

  const url = `${process.env.INDEXER_API_URL}/chain/${chainId}/preliquidations`;

  try {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({ marketIds: whitelistedMarkets }),
    });

    const data = (await response.json()) as {
      preLiquidationData: PreLiquidationData[];
    };

    const preLiquidationInstances = await Promise.all(
      data.preLiquidationData.map(async (preLiquidation) => {
        const {
          markets: { items: market },
        } = await apiSdk.getMarketAssets({
          chainId,
          marketId: preLiquidation.marketId,
        });

        const loanAsset = market !== null ? market[0]?.loanAsset : undefined;
        const collateralAsset =
          market !== null ? market[0]?.collateralAsset : undefined;

        if (
          loanAsset === undefined ||
          collateralAsset === undefined ||
          collateralAsset === null
        )
          return;

        return {
          ...preLiquidation,
          loanAsset,
          collateralAsset,
        };
      }),
    );

    const preLiquidablePositions = await Promise.all(
      preLiquidationInstances
        .filter((position) => position !== undefined)
        .map(async (preLiquidationPosition) => {
          return await Promise.all(
            preLiquidationPosition.enabledPositions.map(async (borrower) => {
              return await getPreLiquidablePosition(
                client,
                preLiquidationPosition,
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
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function getPreLiquidablePosition(
  client: Client<Transport, Chain>,
  preLiquidation: PreLiquidation,
  borrower: string,
  collateralAsset: PartialApiToken,
  loanAsset: PartialApiToken,
) {
  const chainId = client.chain.id;
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
