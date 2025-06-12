import type {
  Address,
  IPreLiquidationParams,
  MarketId,
} from "@morpho-org/blue-sdk";

export type PreLiquidationResponse = {
  warnings: string[];
  results: {
    marketId: MarketId;
    address: Address;
    preLiquidationParams: IPreLiquidationParams;
    enabledPositions: Address[];
    price: bigint;
  }[];
};
