import {
  MathLib,
  ORACLE_PRICE_SCALE,
  type PreLiquidationPosition,
} from "@morpho-org/blue-sdk";

export function parseWithBigInt<T = unknown>(jsonText: string): T {
  return JSON.parse(jsonText, (_key, value) => {
    if (typeof value === "string" && /^-?\d+n$/.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    return value;
  }) as T;
}

export function getRepayDataPreLiquidation(
  preLiquidation: PreLiquidationPosition,
) {
  const lltv = preLiquidation.market.params.lltv;
  const preLltv = preLiquidation.preLiquidationParams.preLltv;
  const ltv = preLiquidation.ltv ?? 0n;
  const quotient = MathLib.wDivDown(ltv - preLltv, lltv - preLltv);

  const preLIF =
    preLiquidation.preLiquidationParams.getIncentiveFactor(quotient);

  const preSeizedAssetsQuoted = MathLib.mulDivUp(
    preLiquidation.seizableCollateral ?? 0n,
    preLiquidation.market.price!,
    ORACLE_PRICE_SCALE,
  );

  const repaidAssets = MathLib.wDivUp(preSeizedAssetsQuoted, preLIF);
  const repaidShares = preLiquidation.market.toBorrowShares(repaidAssets, "Up");

  return { repaidAssets, repaidShares };
}
