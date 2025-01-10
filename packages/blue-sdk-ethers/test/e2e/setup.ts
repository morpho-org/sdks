import { createEthersTest } from "@morpho-org/test/vitest/ethers";
import { mainnet } from "viem/chains";

export const test = createEthersTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});

export const test2 = createEthersTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 21_595_000,
});
