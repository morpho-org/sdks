import { createViemTest } from "@morpho-org/test-viem";
import { mainnet } from "viem/chains";

export const test: ReturnType<typeof createViemTest> = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});
