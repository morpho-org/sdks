import {
  type AccrualPosition,
  MathLib,
  ORACLE_PRICE_SCALE,
  SharesMath,
} from "@morpho-org/blue-sdk";

import type { PreLiquidation } from "./types";

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
