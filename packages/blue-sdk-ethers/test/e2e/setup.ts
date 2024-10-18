import { createEthersTest } from "@morpho-org/test-ethers";
import { mainnet } from "viem/chains";

export const test = createEthersTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});
