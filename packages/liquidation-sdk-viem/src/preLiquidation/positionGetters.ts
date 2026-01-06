import { type MarketId, PreLiquidationPosition } from "@morpho-org/blue-sdk";
import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import type { Account, Chain, Client, Transport } from "viem";
import { apiSdk } from "../api";
import type { PartialApiToken } from "../positions/getters";
import { parseWithBigInt } from "./helpers";
import type { PreLiquidationResponse } from "./types";

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

  const data: PreLiquidationResponse = parseWithBigInt<PreLiquidationResponse>(
    JSON.stringify(await response.json()),
  );

  const marketsAssets = await apiSdk.getMarketsAssets({
    chainId,
    marketIds: data.results.map((preLiquidation) => preLiquidation.marketId),
  });

  const marketAssetsMap = new Map(
    marketsAssets.markets.items?.map((market) => [market.uniqueKey, market]),
  );

  // Extending each result with its corresponding `loanAsset` and `collateralAsset`, if available.
  const dataWithMarketAssetInfo: (PreLiquidationResponse["results"][number] & {
    loanAsset: PartialApiToken;
    collateralAsset: PartialApiToken;
  })[] = [];

  // Populate array -- skipping entries with missing assets, as mentioned
  for (const result of data.results) {
    const { loanAsset, collateralAsset } =
      marketAssetsMap.get(result.marketId) ?? {};

    if (!loanAsset || !collateralAsset) continue;

    dataWithMarketAssetInfo.push({
      ...result,
      loanAsset,
      collateralAsset,
    });
  }

  // Convert to Blue SDK type, `PreLiquidationPosition`
  const preLiquidablePositions = await Promise.all(
    dataWithMarketAssetInfo.flatMap((entry) => {
      return entry.enabledPositions.map(async (user) => {
        const accrualPosition = (
          await fetchAccrualPosition(
            user,
            entry.marketId,
            client,
            // Disable `deployless` so that viem multicall aggregates fetches
            { chainId: client.chain.id, deployless: false },
          )
        ).accrueInterest(Time.timestamp());

        return {
          loanAsset: entry.loanAsset,
          collateralAsset: entry.collateralAsset,
          instance: new PreLiquidationPosition(
            {
              ...accrualPosition,
              preLiquidation: entry.address,
              preLiquidationParams: entry.preLiquidationParams,
              preLiquidationOraclePrice: entry.price,
            },
            accrualPosition.market,
          ),
          type: "PreLiquidationPosition" as const,
        };
      });
    }),
  );

  return preLiquidablePositions.filter(
    (position) => position.instance.seizableCollateral !== undefined,
  );
}
