import { ChainId } from "@morpho-org/blue-sdk";
import { createWagmiTest } from "@morpho-org/test-wagmi";
import { base, mainnet } from "viem/chains";

export const test = {
  [ChainId.EthMainnet]: createWagmiTest(mainnet, {
    forkUrl: process.env.MAINNET_RPC_URL,
    forkBlockNumber: 21_872_137,
  }),
  [ChainId.BaseMainnet]: createWagmiTest(base, {
    forkUrl: process.env.BASE_RPC_URL,
    forkBlockNumber: 26_539_234,
  }),
} as const;
