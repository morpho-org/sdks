import { createViemTest } from "@morpho-org/test/vitest";
import { base, mainnet } from "viem/chains";

/**
 * This test will run on `mainnet` forked at block `19,530,000`.
 */
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});

/**
 * This test will run on `mainnet` forked at block `21,595,000`.
 */
export const test2 = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 21_595_000,
});

/**
 * This test will run on `mainnet` forked at block `21,950,00`.
 */
export const preLiquidationTest = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 21_950_000,
});

export const vaultV2Test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 39_586_444,
});
