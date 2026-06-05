import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";

/**
 * Fork-test fixture pinned to a known `mainnet` block.
 *
 * `MAINNET_RPC_URL` is read directly (matching every other fork suite in the
 * repo) rather than validated at module load: forking only happens when a fork
 * spec actually runs, so the default offline `vitest` collection can import
 * this module without a live RPC. The opt-in `evm-simulation-fork` project /
 * `test:fork` script supply the URL.
 */
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  chainId: mainnet.id,
  forkBlockNumber: 24_593_903n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    // The test account carries EIP-7702 delegation code at this block; wipe it
    // so it behaves as a plain EOA during simulation.
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});
