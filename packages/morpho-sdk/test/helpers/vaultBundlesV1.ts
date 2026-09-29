import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";
import { env } from "../env.js";

/**
 * Mainnet fork fixture pinned after VaultBundlesV1 was deployed.
 */
export const vaultBundlesV1Test = createViemTest(mainnet, {
  forkUrl: env().MAINNET_RPC_URL,
  chainId: mainnet.id,
  forkBlockNumber: 25_730_000n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});
