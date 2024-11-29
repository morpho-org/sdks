import {
  type AccrualPosition,
  ChainUtils,
  type MarketId,
  MathLib,
  ORACLE_PRICE_SCALE,
  SharesMath,
} from "@morpho-org/blue-sdk";
import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import type { PreLiquidation } from "src/helpers/types";
import type { Chain, Client, Transport } from "viem";
import { authorizationLogs, preLiquidationLogs } from "./getLogs";

export async function getPreLiquidablePositions(
  client: Client<Transport, Chain>,
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
  return {
    position: accruedPosition,
    preLiquidation,
    preSeizableCollateral: getSeizabeCollateral(
      accruedPosition,
      preLiquidation,
    ),
  };
}

// Might change to getRepayableShares instead.
function getSeizabeCollateral(
  position: AccrualPosition,
  preLiquidation: PreLiquidation,
) {
  const preLiquidationParams = preLiquidation.preLiquidationParams;
  const lltv = preLiquidationParams.preLltv;
  const preLltv = preLiquidationParams.preLltv;
  if (
    position.borrowAssets > MathLib.wMulDown(position.collateralValue!, lltv) ||
    position.borrowAssets < MathLib.wMulDown(position.collateralValue!, preLltv)
  )
    return undefined;

  const ltv = MathLib.wDivUp(position.borrowAssets, position.collateralValue!);
  const quotient = MathLib.wDivDown(ltv - preLltv, ltv - lltv);
  const preLIF =
    preLiquidationParams.preLIF1 +
    MathLib.wMulDown(
      quotient,
      preLiquidationParams.preLIF2 - preLiquidationParams.preLIF1,
    );
  const preLCF =
    preLiquidationParams.preLCF1 +
    MathLib.wMulDown(
      quotient,
      preLiquidationParams.preLCF2 - preLiquidationParams.preLCF1,
    );

  const repayableShares = MathLib.wMulDown(position.borrowShares, preLCF);
  const repayableAssets = MathLib.wMulDown(
    SharesMath.toAssets(
      repayableShares,
      position.market.totalBorrowAssets,
      position.market.totalBorrowShares,
      "Down",
    ),
    preLIF,
  );

  return MathLib.mulDivDown(
    repayableAssets,
    ORACLE_PRICE_SCALE,
    position.market.price!,
  );
}
