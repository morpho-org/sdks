import { createEthersTest } from "@morpho-org/test/vitest/ethers";
import { mainnet } from "viem/chains";

export const test = createEthersTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 21_365_000,
});
