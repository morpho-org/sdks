import type { PartialApiToken } from "@morpho-org/blue-api-sdk";
import {
  AccrualPosition,
  type Address,
  type MarketId,
  MathLib,
  ORACLE_PRICE_SCALE,
  SharesMath,
} from "@morpho-org/blue-sdk";

export class PreLiquidationPosition extends AccrualPosition {
  public collateralAsset: PartialApiToken;
  public loanAsset: PartialApiToken;

  public preLiquidation?: PreLiquidation;

  constructor(
    position: AccrualPosition,
    collateralAsset: PartialApiToken,
    loanAsset: PartialApiToken,
    preLiquidation?: PreLiquidation,
  ) {
    super(position, position.market);

    this.collateralAsset = collateralAsset;
    this.loanAsset = loanAsset;
    this.preLiquidation = preLiquidation;
  }

  get preSeizableCollateral() {
    if (this.preLiquidation == null) return undefined;

    const preLiquidationParams = this.preLiquidation.preLiquidationParams;
    const lltv = this.market.params.lltv;
    const preLltv = preLiquidationParams.preLltv;
    if (
      this.borrowAssets > MathLib.wMulDown(this.collateralValue!, lltv) ||
      this.borrowAssets < MathLib.wMulDown(this.collateralValue!, preLltv)
    )
      return undefined;

    const ltv = MathLib.wDivUp(this.borrowAssets, this.collateralValue!);
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

    const repayableShares = MathLib.wMulDown(this.borrowShares, preLCF);

    const repayableAssets = MathLib.wMulDown(
      SharesMath.toAssets(
        repayableShares,
        this.market.totalBorrowAssets,
        this.market.totalBorrowShares,
        "Down",
      ),
      preLIF,
    );

    return MathLib.mulDivDown(
      repayableAssets,
      ORACLE_PRICE_SCALE,
      this.market.price!,
    );
  }
}

export type PreLiquidationParams = {
  preLltv: bigint;
  preLCF1: bigint;
  preLCF2: bigint;
  preLIF1: bigint;
  preLIF2: bigint;
  preLiquidationOracle: Address;
};

export type PreLiquidation = {
  marketId: MarketId;
  address: Address;
  preLiquidationParams: PreLiquidationParams;
};

export type PreLiquidationData = {
  marketId: MarketId;
  address: Address;
  preLiquidationParams: PreLiquidationParams;
  enabledPositions: Address[];
  price: bigint | null;
};
