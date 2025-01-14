import { ChainId } from "@morpho-org/blue-sdk";
import { createViemTest } from "@morpho-org/test/vitest";
import { base, mainnet } from "viem/chains";

export const test = {
  [ChainId.EthMainnet]: createViemTest(mainnet, {
    forkUrl: process.env.MAINNET_RPC_URL,
    forkBlockNumber: 19_750_000,
  }),
  [ChainId.BaseMainnet]: createViemTest(base, {
    forkUrl: process.env.BASE_RPC_URL,
    forkBlockNumber: 16_260_000,
  }),
} as const;
