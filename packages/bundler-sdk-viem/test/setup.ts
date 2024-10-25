import { ChainId } from "@morpho-org/blue-sdk";
import { createWagmiTest } from "@morpho-org/test-wagmi";
import { base, mainnet } from "viem/chains";

export const test = {
  [ChainId.EthMainnet]: await createWagmiTest(mainnet, {
    forkUrl: process.env.MAINNET_RPC_URL,
    forkBlockNumber: 19_750_000,
  }),
  [ChainId.BaseMainnet]: await createWagmiTest(base, {
    forkUrl: process.env.BASE_RPC_URL,
    forkBlockNumber: 16_260_000,
  }),
} as const;
