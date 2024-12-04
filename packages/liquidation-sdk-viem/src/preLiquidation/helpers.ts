import {
  type AccrualPosition,
  MathLib,
  ORACLE_PRICE_SCALE,
  SharesMath,
} from "@morpho-org/blue-sdk";
import type { PreLiquidation } from "./types";

export function getSeizabeCollateral(
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
