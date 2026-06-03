import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";
import { env } from "./env.js";

/** Fork-test fixture pinned to a known `mainnet` block. */
export const test = createViemTest(mainnet, {
  forkUrl: env().MAINNET_RPC_URL,
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
