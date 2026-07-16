import { createViemTest } from "@morpho-org/test/vitest";
import { base } from "viem/chains";

export const test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 48_287_000n,
  stepsTracing: false,
});
