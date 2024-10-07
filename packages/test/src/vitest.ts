import type { Chain, HttpTransport } from "viem";
import { anvil } from "viem/chains";
import { test } from "vitest";
import type { Config } from "wagmi";
import { type AnvilArgs, createAnvilTestClient, spawnAnvil } from "./anvil.js";
import { testAccount } from "./fixtures.js";

// Vitest needs to serialize BigInts to JSON, so we need to add a toJSON method to BigInt.prototype.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

declare global {
  namespace NodeJS {
    interface Process {
      __tinypool_state__: {
        isChildProcess: boolean;
        isTinypoolWorker: boolean;
        workerData: null;
        workerId: number;
      };
    }
  }
}

export const createAnvilTest = <chain extends Chain = typeof anvil>(
  parameters: AnvilArgs = {},
  chain: chain = anvil as unknown as chain,
): ReturnType<
  typeof test.extend<{
    client: ReturnType<typeof createAnvilTestClient<chain>>;
  }>
> => {
  parameters.forkChainId ??= chain?.id;
  parameters.forkUrl ??= chain?.rpcUrls.default.http[0];
  parameters.autoImpersonate ??= true;
  parameters.order ??= "fifo";

  parameters.gasPrice ??= 0n;
  parameters.blockBaseFeePerGas ??= 0n;

  let port = 0;

  return test.extend({
    // biome-ignore lint/correctness/noEmptyPattern: required by vitest at runtime
    client: async ({}, use) => {
      const { transport, stop } = await spawnAnvil(parameters, port++);

      await use(createAnvilTestClient(chain, transport));

      await stop();
    },
  });
};

export const createAnvilWagmiTest = <chain extends Chain = typeof anvil>(
  parameters: AnvilArgs = {},
  chain: chain = anvil as unknown as chain,
): ReturnType<
  typeof test.extend<{
    wagmi: {
      config: Config<readonly [chain], Record<chain["id"], HttpTransport>>;
      client: ReturnType<typeof createAnvilTestClient<chain>>;
    };
  }>
> => {
  parameters.forkChainId ??= chain?.id;
  parameters.forkUrl ??= chain?.rpcUrls.default.http[0];
  parameters.autoImpersonate ??= true;
  parameters.order ??= "fifo";

  parameters.gasPrice ??= 0n;
  parameters.blockBaseFeePerGas ??= 0n;

  let port = 0;

  return test.extend({
    // biome-ignore lint/correctness/noEmptyPattern: required by vitest at runtime
    wagmi: async ({}, use) => {
      const { createConfig, mock } = await import("@wagmi/core");

      const { transport, stop } = await spawnAnvil(parameters, port++);

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
