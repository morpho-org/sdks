import type { AccrualPosition, Address, MarketId } from "@morpho-org/blue-sdk";

export type preLiquidationPosition = {
  position: AccrualPosition;
  preLiquidation: PreLiquidation;
  preSeizableCollateral?: bigint;
};

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
