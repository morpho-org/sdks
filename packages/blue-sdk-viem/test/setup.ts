import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { base, mainnet } from "viem/chains";

/**
 * This test will run on `mainnet` forked at block `19,530,000`.
 */
export const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 19_530_000,
});

/**
 * This test will run on `mainnet` forked at block `21,595,000`.
 */
export const test2 = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 21_595_000,
});

/**
 * This test will run on `mainnet` forked at block `24,671,815`.
 */
export const testTreehouseEth = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 24_671_815,
});

/**
 * This test will run on `mainnet` forked at block `21,950,00`.
 */
export const preLiquidationTest = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 21_950_000,
});

export const vaultV2Test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 41_290_768,
  pruneHistory: false,
  stepsTracing: false,
});
