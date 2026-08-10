import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";
import { env } from "./env.js";

/**
 * This test will run on `mainnet`
 */
export const test = createViemTest(mainnet, {
  forkUrl: env().MAINNET_RPC_URL,
  chainId: mainnet.id,
  forkBlockNumber: 24_593_903n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    // The test account (0xf39Fd6…) has EIP-7702 delegation code on mainnet at
    // this fork block signatureChecker sees code and attempts EIP-1271
    // validation instead of ecrecover, breaking all permit signatures.
    // The cleanup in createViemTest (signAuthorization → zeroAddress) doesn't
    // fully clear the bytecode, so we wipe it explicitly via anvil_setCode.
    await client.setCode({
      address: client.account.address,
      bytecode: "0x",
    });
    await use(client);
  },
});
