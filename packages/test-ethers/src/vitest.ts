import type { AnvilArgs } from "@morpho-org/test";
import { type ViemTestContext, createViemTest } from "@morpho-org/test";
import { type HDNodeWallet, JsonRpcProvider } from "ethers";
import type { Chain } from "viem";
import { testWallet } from "./fixtures";

export interface EthersWalletTestContext {
  wallet: HDNodeWallet & { provider: JsonRpcProvider };
}

export interface EthersTestContext<chain extends Chain = Chain>
  extends ViemTestContext<chain>,
    EthersWalletTestContext {}

export const createEthersTest = async <chain extends Chain>(
  chain: chain,
  parameters?: AnvilArgs,
) => {
  const test = await createViemTest(chain, parameters);

  return test.extend<EthersWalletTestContext>({
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
