import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";

// The shared fixture owns the Anvil lifecycle for each test.
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  chainId: mainnet.id,
  forkBlockNumber: 25_730_000n,
  stepsTracing: false,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});
