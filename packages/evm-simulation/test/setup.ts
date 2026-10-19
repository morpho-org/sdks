import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";

/**
 * Fork-test fixture pinned to a known `mainnet` block.
 *
 * `ERPC_SECRET` is read without validation at module load: forking only happens
 * when a fork spec actually runs, so offline test collection can import this
 * module without a key. Without it, Anvil uses mainnet's public RPC.
 */
export const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
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
