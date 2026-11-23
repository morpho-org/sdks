import {
  BASE_HISTORICAL_FORK_BLOCK,
  getErpcForkUrl,
  MAINNET_FORK_BLOCK,
} from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { base, mainnet } from "viem/chains";

// Exact Steakhouse USDC assets, ownership and queue snapshot.
const LEGACY_VAULT_FORK_BLOCK = 19_530_000n;
// Exact Vault v1.1 Steakhouse PAXG snapshot.
const STEAKHOUSE_PAXG_FORK_BLOCK = 21_595_000n;
// Exact Vault V2 assets, allocations and deposit/withdraw limits.
const VAULT_V2_FORK_BLOCK = 41_290_768n;

/** Historical Steakhouse USDC fork. */
export const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: LEGACY_VAULT_FORK_BLOCK,
});

/** Historical Vault v1.1 Steakhouse PAXG fork. */
export const test2 = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: STEAKHOUSE_PAXG_FORK_BLOCK,
});

/**
 * This test uses the shared mainnet fork block.
 */
export const testTreehouseEth = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: MAINNET_FORK_BLOCK,
});

/**
 * This test uses the shared mainnet fork block.
 */
export const preLiquidationTest = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: MAINNET_FORK_BLOCK,
});

export const vaultV2Test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: VAULT_V2_FORK_BLOCK,
  pruneHistory: false,
  stepsTracing: false,
});

/** This test preserves historical ERC-3643 issuer and recipient eligibility. */
export const erc3643Test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_HISTORICAL_FORK_BLOCK,
});
