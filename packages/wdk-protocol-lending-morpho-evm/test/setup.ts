import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";

// The shared fixture owns the Anvil lifecycle for each test.
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 24_593_903,
  stepsTracing: false,
});
