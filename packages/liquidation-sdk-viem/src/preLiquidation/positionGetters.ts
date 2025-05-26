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
  indexerApiBaseUrl = process.env.INDEXER_API_URL,
) {
  const chainId = client.chain.id;

  const url = new URL(`/chain/${chainId}/preliquidations`, indexerApiBaseUrl);

  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify({ marketIds: whitelistedMarkets }),
  });

  const data = (await response.json()) as {
    results: PreLiquidationData[];
  };

  const marketsAssets = await apiSdk.getMarketsAssets({
    chainId,
    marketIds: data.results.map((preLiquidation) => preLiquidation.marketId),
  });

  const marketAssetsMap = new Map(
    marketsAssets.markets.items?.map((market) => [market.uniqueKey, market]),
  );

  const preLiquidationInstances = await Promise.all(
    data.results
      .filter((preLiquidation) => preLiquidation.price !== null)
      .map((preLiquidation) => {
        return {
          ...preLiquidation,
          price: BigInt(preLiquidation.price!),
          preLiquidationParams: {
            ...preLiquidation.preLiquidationParams,
            preLCF1: BigInt(preLiquidation.preLiquidationParams.preLCF1),
            preLCF2: BigInt(preLiquidation.preLiquidationParams.preLCF2),
            preLIF1: BigInt(preLiquidation.preLiquidationParams.preLIF1),
            preLIF2: BigInt(preLiquidation.preLiquidationParams.preLIF2),
            preLltv: BigInt(preLiquidation.preLiquidationParams.preLltv),
          },
        };
      })
      .map(async (preLiquidation) => {
        const { loanAsset, collateralAsset } =
          marketAssetsMap.get(preLiquidation.marketId) ?? {};

        if (loanAsset == null || collateralAsset == null) return;

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
      .flatMap((preLiquidationPosition) => {
        return preLiquidationPosition.enabledPositions.map((borrower) => {
          return getPreLiquidablePosition(
            client,
            preLiquidationPosition,
            borrower,
            preLiquidationPosition.collateralAsset,
            preLiquidationPosition.loanAsset,
          );
        });
      }),
  );

  return preLiquidablePositions.filter(
    (position) => position.preSeizableCollateral !== undefined,
  );
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
