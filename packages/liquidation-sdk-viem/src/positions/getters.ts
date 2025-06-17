import { OrderDirection, type PartialApiToken } from "@morpho-org/blue-api-sdk";
import {
  AccrualPosition,
  type ChainId,
  type MarketId,
  type PreLiquidationPosition,
} from "@morpho-org/blue-sdk";
import { fetchMarket } from "@morpho-org/blue-sdk-viem";
import { getPreLiquidablePositions } from "@morpho-org/liquidation-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import type { Account, Chain, Client, Transport } from "viem";
import { apiSdk, paginatedQueryWithChunkedMarketIds } from "../api";

export async function getPositions(
  client: Client<Transport, Chain, Account>,
  chainId: ChainId,
  wNative: string,
  marketIds: MarketId[],
): Promise<{
  positions: ({
    loanAsset: PartialApiToken;
    collateralAsset: PartialApiToken;
  } & (
    | { instance: AccrualPosition; type: "AccrualPosition" }
    | { instance: PreLiquidationPosition; type: "PreLiquidationPosition" }
  ))[];
  wethPriceUsd: number | null;
}> {
  const [{ liquidablePositions, wethPriceUsd }, preLiquidablePositions] =
    await Promise.all([
      getLiquidatablePositions(client, chainId, wNative, marketIds),
      getPreLiquidablePositions(client, marketIds).catch((error) => {
        console.error(error);
        return [];
      }),
    ]);

  if (wethPriceUsd == null) return { positions: [], wethPriceUsd };

  return {
    positions: [...liquidablePositions, ...preLiquidablePositions],
    wethPriceUsd,
  };
}

async function getLiquidatablePositions(
  client: Client<Transport, Chain, Account>,
  chainId: ChainId,
  wNative: string,
  marketIds: MarketId[],
): Promise<{
  liquidablePositions: {
    instance: AccrualPosition;
    type: "AccrualPosition";
    loanAsset: PartialApiToken;
    collateralAsset: PartialApiToken;
  }[];
  wethPriceUsd: number | null;
}> {
  const queryOptions = {
    maxMarketIds: 20,
    pageSize: 100,
    orderBy: "BorrowShares" as const,
    orderDirection: OrderDirection.Desc,
  };
  const [
    {
      assetByAddress: { priceUsd: wethPriceUsd },
    },
    marketsAssets,
    positions,
  ] = await Promise.all([
    apiSdk.getAssetByAddress({ chainId, address: wNative }),
    paginatedQueryWithChunkedMarketIds(
      (vars) => apiSdk.getMarketsAssets(vars).then((result) => result.markets),
      {
        ...queryOptions,
        args: { chainId, marketIds },
      },
    ),
    paginatedQueryWithChunkedMarketIds(
      (vars) =>
        apiSdk
          .getLiquidatablePositions(vars)
          .then((result) => result.marketPositions),
      {
        ...queryOptions,
        args: { chainId, wNative, marketIds },
      },
    ),
  ]);

  if (wethPriceUsd == null) return { liquidablePositions: [], wethPriceUsd };

  const marketAssetsMap = new Map(
    marketsAssets?.map((market) => [market.uniqueKey, market]),
  );

  const marketsMap = new Map(
    await Promise.all(
      [...marketIds].map(async (marketId) => {
        const market = await fetchMarket(marketId, client, {
          chainId,
          // Disable `deployless` so that viem multicall aggregates fetches
          deployless: false,
        });
        return [marketId, market.accrueInterest(Time.timestamp())] as const;
      }),
    ),
  );

  const accruedPositions = (positions ?? [])
    .map((position) => {
      const market = marketsMap.get(position.market.uniqueKey);
      if (!market) return;

      const assets = marketAssetsMap.get(position.market.uniqueKey);
      if (!assets?.collateralAsset || !assets?.loanAsset) return;

      const accrualPosition = new AccrualPosition(
        {
          user: position.user.address,
          // NOTE: These come as strings when mocking GraphQL response in tests, so we cast manually
          supplyShares: BigInt(position.state?.supplyShares ?? "0"),
          borrowShares: BigInt(position.state?.borrowShares ?? "0"),
          collateral: BigInt(position.state?.collateral ?? "0"),
        },
        market,
      );

      return {
        instance: accrualPosition,
        type: "AccrualPosition" as const,
        loanAsset: assets.loanAsset,
        collateralAsset: assets.collateralAsset,
      };
    })
    .filter((position) => position !== undefined);

  return {
    liquidablePositions: accruedPositions.filter(
      (position) => position.instance.seizableCollateral !== undefined,
    ),
    wethPriceUsd,
  };
}
