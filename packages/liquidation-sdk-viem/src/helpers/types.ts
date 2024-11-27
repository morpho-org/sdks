import type { Address } from "@morpho-org/blue-sdk";

export type PreLiquidationParams = {
  preLltv: bigint;
  preLCF1: bigint;
  preLCF2: bigint;
  preLIF1: bigint;
  preLIF2: bigint;
  preLiquidationOracle: Address;
};

export type PreLiquidation = {
  marketId: bigint;
  address: Address;
  preLiquidationParams: PreLiquidationParams;
};
