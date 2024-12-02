import {
  AccrualPosition,
  type Address,
  type MarketId,
} from "@morpho-org/blue-sdk";
import { getSeizabeCollateral } from "./helpers";

export class PreLiquidationPosition extends AccrualPosition {
  public preLiquidation?: PreLiquidation;

  public preSeizableCollateral?: bigint;

  constructor(position: AccrualPosition, preLiquidation?: PreLiquidation) {
    super(position, position.market);

    this.preLiquidation = preLiquidation;
    this.preSeizableCollateral = preLiquidation
      ? getSeizabeCollateral(position, preLiquidation)
      : undefined;
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
