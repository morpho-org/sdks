import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";

// The shared fixture owns the Anvil lifecycle for each test.
export const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 25_730_000n,
  stepsTracing: false,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});
