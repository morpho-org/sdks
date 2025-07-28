import { ChainId } from "@morpho-org/blue-sdk";
import { createViemTest } from "@morpho-org/test/vitest";
import { arbitrum, base, mainnet, polygon } from "viem/chains";

export const test = {
  [ChainId.EthMainnet]: createViemTest(mainnet, {
    forkUrl: process.env.MAINNET_RPC_URL,
    forkBlockNumber: 21_872_137,
  }),
  [ChainId.BaseMainnet]: createViemTest(base, {
    forkUrl: process.env.BASE_RPC_URL,
    forkBlockNumber: 26_539_234,
  }),
  [ChainId.ArbitrumMainnet]: createViemTest(arbitrum, {
    forkUrl: process.env.ARBITRUM_RPC_URL,
    forkBlockNumber: 361_575_517,
  }),
  [ChainId.PolygonMainnet]: createViemTest(polygon, {
    forkUrl: process.env.POLYGON_RPC_URL,
    forkBlockNumber: 74_069_107,
  }),
} as const;
