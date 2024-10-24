import type { AnvilArgs } from "@morpho-org/test";
import { type ViemTestContext, createViemTest } from "@morpho-org/test-viem";
import { type HDNodeWallet, JsonRpcProvider } from "ethers";
import type { Chain } from "viem";
import type { test } from "vitest";
import { testWallet } from "./fixtures.js";

export interface EthersWalletTestContext {
  wallet: HDNodeWallet & { provider: JsonRpcProvider };
}

export interface EthersTestContext<chain extends Chain = Chain>
  extends ViemTestContext<chain>,
    EthersWalletTestContext {}

export const createEthersTest = <chain extends Chain>(
  chain: chain,
  parameters?: AnvilArgs,
): ReturnType<typeof test.extend<EthersTestContext<chain>>> => {
  return createViemTest(chain, parameters).extend<EthersWalletTestContext>({
    wallet: async ({ client }, use) => {
      await use(
        testWallet(
          new JsonRpcProvider(client.transport.url, undefined, {
            staticNetwork: true,
          }),
        ),
      );
    },
  });
};
