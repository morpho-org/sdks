import { ChainId } from "@morpho-org/blue-sdk";
import { createViemTest } from "@morpho-org/test/vitest";
import { arbitrum, base, mainnet } from "viem/chains";

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
    forkBlockNumber: 358_585_968,
  }),
} as const;
