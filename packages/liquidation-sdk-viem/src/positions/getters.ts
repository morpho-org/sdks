import type { PartialApiToken } from "@morpho-org/blue-api-sdk";
import type {
  AccrualPosition,
  ChainId,
  MarketId,
  PreLiquidationPosition,
} from "@morpho-org/blue-sdk";
import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { getPreLiquidablePositions } from "@morpho-org/liquidation-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import type { Account, Chain, Client, Transport } from "viem";
import { apiSdk } from "../api";

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
  const {
    assetByAddress: { priceUsd: wethPriceUsd },
    marketPositions: { items: positions },
  } = await apiSdk.getLiquidatablePositions({
    chainId,
    wNative,
    marketIds,
  });

  if (wethPriceUsd == null) return { liquidablePositions: [], wethPriceUsd };

  const accruedPositions = (
    await Promise.all(
      (positions ?? []).map(async (position) => {
        if (position.market.collateralAsset == null) return;

        const accrualPosition = await fetchAccrualPosition(
          position.user.address,
          position.market.uniqueKey,
          client,
          // Disable `deployless` so that viem multicall aggregates fetches
          { chainId, deployless: false },
        );

        return {
          instance: accrualPosition.accrueInterest(Time.timestamp()),
          type: "AccrualPosition" as const,
          loanAsset: position.market.loanAsset,
          collateralAsset: position.market.collateralAsset,
        };
      }),
    )
  ).filter((position) => position !== undefined);

  return {
    liquidablePositions: accruedPositions.filter(
      (position) => position.instance.seizableCollateral !== undefined,
    ),
    wethPriceUsd,
  };
}
