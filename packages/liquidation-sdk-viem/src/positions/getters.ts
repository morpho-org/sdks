import type { ChainId, MarketId } from "@morpho-org/blue-sdk";
import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import {
  PreLiquidationPosition,
  getPreLiquidablePositions,
} from "@morpho-org/liquidation-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import type { Account, Chain, Client, Transport } from "viem";
import { apiSdk } from "../api";

export async function getPositions(
  client: Client<Transport, Chain, Account>,
  chainId: ChainId,
  wNative: string,
  marketIds: MarketId[],
): Promise<{
  positions: PreLiquidationPosition[];
  wethPriceUsd: number | null;
}> {
  const [{ liquidablePositions, wethPriceUsd }, preLiquidablePositions] =
    await Promise.all([
      getLiquidatablePositions(client, chainId, wNative, marketIds),
      getPreLiquidablePositions(client, marketIds),
    ]);

  if (wethPriceUsd == null) return { positions: [], wethPriceUsd };

  return {
    positions: liquidablePositions.concat(preLiquidablePositions),
    wethPriceUsd,
  };
}

async function getLiquidatablePositions(
  client: Client<Transport, Chain, Account>,
  chainId: ChainId,
  wNative: string,
  marketIds: MarketId[],
): Promise<{
  liquidablePositions: PreLiquidationPosition[];
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
          { chainId },
        );

        return new PreLiquidationPosition(
          accrualPosition.accrueInterest(Time.timestamp()),
          position.market.collateralAsset,
          position.market.loanAsset,
        );
      }),
    )
  ).filter((position) => position !== undefined);

  return {
    liquidablePositions: accruedPositions.filter(
      (position) => position.seizableCollateral !== undefined,
    ),
    wethPriceUsd,
  };
}
