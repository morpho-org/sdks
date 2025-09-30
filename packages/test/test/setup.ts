import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";

/**
 * This test will run on `mainnet` forked at block `19,530,000`.
 */
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});
