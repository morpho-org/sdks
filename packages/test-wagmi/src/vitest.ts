import { type AnvilArgs, spawnAnvil } from "@morpho-org/test";
import {
  type AnvilTestClient,
  createAnvilTestClient,
  testAccount,
} from "@morpho-org/test-viem";
import { http, type Chain, type HttpTransport } from "viem";
import { anvil } from "viem/chains";
import { test } from "vitest";
import type { Config } from "wagmi";

export const createWagmiTest = <chain extends Chain = typeof anvil>(
  parameters: AnvilArgs = {},
  chain: chain = anvil as unknown as chain,
): ReturnType<
  typeof test.extend<{
    wagmi: {
      config: Config<readonly [chain], Record<chain["id"], HttpTransport>>;
      client: AnvilTestClient<chain>;
    };
  }>
> => {
  parameters.forkChainId ??= chain?.id;
  parameters.forkUrl ??= chain?.rpcUrls.default.http[0];
  parameters.autoImpersonate ??= true;
  parameters.order ??= "fifo";

  parameters.gasPrice ??= 0n;
  parameters.blockBaseFeePerGas ??= 0n;
  parameters.disableMinPriorityFee ??= true;

  let port = 0;

  return test.extend({
    // biome-ignore lint/correctness/noEmptyPattern: required by vitest at runtime
    wagmi: async ({}, use) => {
      const { createConfig, mock } = await import("@wagmi/core");

      const { rpcUrl, stop } = await spawnAnvil(parameters, port++);

      const transport = http(rpcUrl);

      await use({
        config: createConfig({
          chains: [chain],
          connectors: [
            mock({
              accounts: [
                testAccount().address,
                ...new Array(parameters.accounts ?? 9)
                  .fill(null)
                  .map((_, i) => testAccount(i + 1).address),
              ],
            }),
          ],
          pollingInterval: 100,
          storage: null,
          transports: {
            [chain.id]: transport,
          },
        }),
        client: createAnvilTestClient(chain, transport),
      });

      await stop();
    },
  });
};
