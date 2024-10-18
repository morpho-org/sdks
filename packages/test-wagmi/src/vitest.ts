import type { AnvilArgs } from "@morpho-org/test";
import {
  type ViemTestContext,
  createViemTest,
  testAccount,
} from "@morpho-org/test-viem";
import { createConfig, mock } from "@wagmi/core";
import type { Chain, HttpTransport } from "viem";
import type { Config } from "wagmi";

export interface WagmiConfigTestContext<chain extends Chain = Chain> {
  config: Config<readonly [chain], Record<chain["id"], HttpTransport>>;
}

export interface WagmiTestContext<chain extends Chain = Chain>
  extends ViemTestContext<chain>,
    WagmiConfigTestContext<chain> {}

export const createWagmiTest = <chain extends Chain>(
  chain: chain,
  parameters?: AnvilArgs,
) => {
  return createViemTest(chain, parameters).extend<
    WagmiConfigTestContext<chain>
  >({
    config: async ({ client }, use) => {
      await use(
        createConfig({
          chains: [chain],
          connectors: [
            mock({
              accounts: [
                testAccount().address,
                ...new Array(parameters?.accounts ?? 9)
                  .fill(null)
                  .map((_, i) => testAccount(i + 1).address),
              ],
            }),
          ],
          storage: null,
          client: () => client,
        }),
      );
    },
  });
};
