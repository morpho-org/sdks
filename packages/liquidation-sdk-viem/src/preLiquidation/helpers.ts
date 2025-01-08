import {
  type AccrualPosition,
  MathLib,
  ORACLE_PRICE_SCALE,
  SharesMath,
} from "@morpho-org/blue-sdk";
import { parseEther } from "viem";
import type { PreLiquidation } from "./types";

export function getPreSeizableCollateral(
  position: AccrualPosition,
  preLiquidation: PreLiquidation,
) {
  const preLiquidationParams = preLiquidation.preLiquidationParams;
  const lltv = position.market.params.lltv;
  const preLltv = preLiquidationParams.preLltv;
  if (
    position.borrowAssets > MathLib.wMulDown(position.collateralValue!, lltv) ||
    position.borrowAssets < MathLib.wMulDown(position.collateralValue!, preLltv)
  )
    return undefined;

  const ltv = MathLib.wDivUp(position.borrowAssets, position.collateralValue!);
  const quotient = MathLib.wDivDown(ltv - preLltv, lltv - preLltv);
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

  const repayableShares = MathLib.mulDivDown(
    position.borrowShares,
    preLCF,
    parseEther("1.01"), // adding a 1% security to not repay too much
  );

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

export function getRepayDataPreLiquidation(
  position: AccrualPosition,
  preLiquidation: PreLiquidation,
  preSeizableCollateral: bigint,
) {
  const lltv = position.market.params.lltv;
  const preLltv = preLiquidation.preLiquidationParams.preLltv;
  const ltv = MathLib.wDivUp(position.borrowAssets, position.collateralValue!);
  const quotient = MathLib.wDivDown(ltv - preLltv, lltv - preLltv);

  const preLIF =
    preLiquidation.preLiquidationParams.preLIF1 +
    MathLib.wMulDown(
      quotient,
      preLiquidation.preLiquidationParams.preLIF2 -
        preLiquidation.preLiquidationParams.preLIF1,
    );

  const preSeizedAssetsQuoted = MathLib.mulDivUp(
    preSeizableCollateral,
    position.market.price!,
    ORACLE_PRICE_SCALE,
  );

  const repaidAssets = MathLib.wDivUp(preSeizedAssetsQuoted, preLIF);
  const repaidShares = SharesMath.toShares(
    repaidAssets,
    position.market.totalBorrowAssets,
    position.market.totalBorrowShares,
    "Up",
  );

  return { repaidAssets, repaidShares };
}
