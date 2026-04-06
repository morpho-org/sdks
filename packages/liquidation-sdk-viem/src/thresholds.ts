import { ChainId } from "@gfxlabs/blue-sdk";
import { parseEther } from "viem";

export const collateralUsdThreshold: Record<number, bigint> = {
  [ChainId.EthMainnet]: parseEther("1000"),
  [ChainId.BaseMainnet]: parseEther("2"),
  [ChainId.PolygonMainnet]: parseEther("2"),
  [ChainId.ArbitrumMainnet]: parseEther("2"),
};
