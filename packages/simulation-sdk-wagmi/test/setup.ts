import { createWagmiTest } from "@morpho-org/test-wagmi";
import { mainnet } from "viem/chains";

export const test = createWagmiTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_750_000,
});
