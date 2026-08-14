import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";

// The shared fixture owns Anvil cleanup and the cross-worker RPC semaphore.
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 24_593_903,
  stepsTracing: false,
});
